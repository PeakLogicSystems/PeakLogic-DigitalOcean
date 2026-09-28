/*
 * Minimal MQTT 3.1.1 broker for Opta (PubSubClient-compatible subset).
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "mqtt_local.h"

#include <errno.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/inet.h"
#include "lwip/sockets.h"

static const char *TAG = "mqtt_local";

#define MQTT_LOCAL_MAX_CLIENTS  3
#define MQTT_LOCAL_MAX_SUBS     12
#define MQTT_LOCAL_TOPIC_MAX    160
#define MQTT_LOCAL_PAYLOAD_MAX  4096
#define MQTT_LOCAL_BUF_MAX      (MQTT_LOCAL_PAYLOAD_MAX + 256)

typedef struct
{
    bool used;
    int sock;
    char subs[MQTT_LOCAL_MAX_SUBS][MQTT_LOCAL_TOPIC_MAX];
    int sub_count;
} mqtt_client_t;

static mqtt_client_t s_clients[MQTT_LOCAL_MAX_CLIENTS];
static int s_listen = -1;
static mqtt_local_publish_cb_t s_pub_cb;
static void *s_pub_ctx;
static bool s_listening;

static int mqtt_decode_rem_len(const uint8_t *buf, size_t len, size_t *used)
{
    uint32_t mult = 1;
    uint32_t value = 0;
    size_t i = 0;
    for (; i < len && i < 4; i++)
    {
        value += (buf[i] & 0x7f) * mult;
        if ((buf[i] & 0x80) == 0)
        {
            *used = i + 1;
            return (int)value;
        }
        mult *= 128;
    }
    return -1;
}

static size_t mqtt_encode_rem_len(uint8_t *buf, size_t len)
{
    uint32_t x = len;
    size_t i = 0;
    do
    {
        uint8_t b = x % 128;
        x /= 128;
        if (x > 0)
        {
            b |= 0x80;
        }
        buf[i++] = b;
    } while (x > 0 && i < 4);
    return i;
}

static mqtt_client_t *client_by_sock(int sock)
{
    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (s_clients[i].used && s_clients[i].sock == sock)
        {
            return &s_clients[i];
        }
    }
    return NULL;
}

static mqtt_client_t *client_alloc(int sock)
{
    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (!s_clients[i].used)
        {
            memset(&s_clients[i], 0, sizeof(s_clients[i]));
            s_clients[i].used = true;
            s_clients[i].sock = sock;
            return &s_clients[i];
        }
    }
    return NULL;
}

static void client_drop(mqtt_client_t *c)
{
    if (c == NULL)
    {
        return;
    }
    if (c->sock >= 0)
    {
        close(c->sock);
    }
    memset(c, 0, sizeof(*c));
    c->sock = -1;
}

static bool topic_matches(const char *sub, const char *topic)
{
    if (sub == NULL || topic == NULL)
    {
        return false;
    }
    if (strcmp(sub, topic) == 0)
    {
        return true;
    }
    size_t sl = strlen(sub);
    if (sl >= 2 && sub[sl - 1] == '#' && strncmp(sub, topic, sl - 1) == 0)
    {
        return true;
    }
    if (strchr(sub, '+') != NULL || strchr(sub, '#') != NULL)
    {
        /* Opta uses exact topic subs — skip complex wildcards for now */
        return false;
    }
    return false;
}

static bool sock_send_all(int sock, const uint8_t *data, size_t len)
{
    size_t off = 0;
    while (off < len)
    {
        ssize_t n = send(sock, data + off, len - off, 0);
        if (n <= 0)
        {
            return false;
        }
        off += (size_t)n;
    }
    return true;
}

static void send_connack(int sock, uint8_t rc)
{
    uint8_t pkt[] = { 0x20, 0x02, 0x00, rc };
    sock_send_all(sock, pkt, sizeof(pkt));
}

static void send_puback(int sock, uint16_t pid)
{
    uint8_t pkt[] = { 0x40, 0x02, (uint8_t)(pid >> 8), (uint8_t)(pid & 0xff) };
    sock_send_all(sock, pkt, sizeof(pkt));
}

static void send_suback(int sock, uint16_t pid, uint8_t qos)
{
    uint8_t pkt[] = { 0x90, 0x03, (uint8_t)(pid >> 8), (uint8_t)(pid & 0xff), qos };
    sock_send_all(sock, pkt, sizeof(pkt));
}

static void send_pingresp(int sock)
{
    uint8_t pkt[] = { 0xd0, 0x00 };
    sock_send_all(sock, pkt, sizeof(pkt));
}

static bool read_string(const uint8_t *buf, size_t len, size_t *off, char *out, size_t out_len)
{
    if (*off + 2 > len)
    {
        return false;
    }
    uint16_t sl = ((uint16_t)buf[*off] << 8) | buf[*off + 1];
    *off += 2;
    if (*off + sl > len || sl + 1 > out_len)
    {
        return false;
    }
    memcpy(out, buf + *off, sl);
    out[sl] = '\0';
    *off += sl;
    return true;
}

static void handle_publish(mqtt_client_t *src, const uint8_t *buf, size_t len, uint8_t flags)
{
    size_t off = 1;
    size_t rl_used = 0;
    if (mqtt_decode_rem_len(buf + 1, len - 1, &rl_used) < 0)
    {
        return;
    }
    off += rl_used;

    char topic[MQTT_LOCAL_TOPIC_MAX];
    if (!read_string(buf, len, &off, topic, sizeof(topic)))
    {
        return;
    }

    uint16_t pid = 0;
    if (flags & 0x06)
    {
        if (off + 2 > len)
        {
            return;
        }
        pid = ((uint16_t)buf[off] << 8) | buf[off + 1];
        off += 2;
    }

    size_t plen = len - off;
    if (plen > MQTT_LOCAL_PAYLOAD_MAX)
    {
        plen = MQTT_LOCAL_PAYLOAD_MAX;
    }

    int qos = (flags >> 1) & 0x03;
    bool retain = (flags & 0x01) != 0;

    if (s_pub_cb)
    {
        s_pub_cb(topic, buf + off, plen, qos, retain, s_pub_ctx);
    }

    if (qos == 1 && pid != 0 && src != NULL)
    {
        send_puback(src->sock, pid);
    }
}

static void handle_subscribe(mqtt_client_t *c, const uint8_t *buf, size_t len)
{
    size_t off = 1;
    size_t rl_used = 0;
    if (mqtt_decode_rem_len(buf + 1, len - 1, &rl_used) < 0 || off + rl_used + 2 > len)
    {
        return;
    }
    off += rl_used;
    uint16_t pid = ((uint16_t)buf[off] << 8) | buf[off + 1];
    off += 2;

    uint8_t last_qos = 0;
    while (off < len && c->sub_count < MQTT_LOCAL_MAX_SUBS)
    {
        char topic[MQTT_LOCAL_TOPIC_MAX];
        if (!read_string(buf, len, &off, topic, sizeof(topic)))
        {
            break;
        }
        if (off >= len)
        {
            break;
        }
        last_qos = buf[off++];
        strncpy(c->subs[c->sub_count], topic, MQTT_LOCAL_TOPIC_MAX - 1);
        c->sub_count++;
        ESP_LOGI(TAG, "subscribe: %s", topic);
    }
    send_suback(c->sock, pid, last_qos);
}

static void handle_packet(mqtt_client_t *c, const uint8_t *buf, size_t len)
{
    if (len < 2)
    {
        return;
    }
    uint8_t type = buf[0] >> 4;
    uint8_t flags = buf[0] & 0x0f;

    switch (type)
    {
        case 1: /* CONNECT */
            send_connack(c->sock, 0);
            break;
        case 3: /* PUBLISH */
            handle_publish(c, buf, len, flags);
            break;
        case 8: /* SUBSCRIBE */
            handle_subscribe(c, buf, len);
            break;
        case 12: /* PINGREQ */
            send_pingresp(c->sock);
            break;
        case 14: /* DISCONNECT */
            client_drop(c);
            break;
        default:
            break;
    }
}

bool mqtt_local_start(const char *bind_ip, uint16_t port,
                      mqtt_local_publish_cb_t on_publish, void *ctx)
{
    s_pub_cb = on_publish;
    s_pub_ctx = ctx;

    if (s_listen >= 0)
    {
        close(s_listen);
        s_listen = -1;
    }

    s_listen = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
    if (s_listen < 0)
    {
        ESP_LOGE(TAG, "socket() failed");
        return false;
    }

    int opt = 1;
    setsockopt(s_listen, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = { 0 };
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    if (bind_ip == NULL || bind_ip[0] == '\0' || strcmp(bind_ip, "0.0.0.0") == 0)
    {
        addr.sin_addr.s_addr = htonl(INADDR_ANY);
    }
    else
    {
        inet_aton(bind_ip, &addr.sin_addr);
    }

    if (bind(s_listen, (struct sockaddr *)&addr, sizeof(addr)) != 0)
    {
        ESP_LOGE(TAG, "bind(%s:%u) errno=%d", bind_ip ? bind_ip : "0.0.0.0", port, errno);
        close(s_listen);
        s_listen = -1;
        return false;
    }

    if (listen(s_listen, MQTT_LOCAL_MAX_CLIENTS) != 0)
    {
        ESP_LOGE(TAG, "listen failed");
        close(s_listen);
        s_listen = -1;
        return false;
    }

    s_listening = true;
    ESP_LOGI(TAG, "local broker listening on %s:%u (anonymous)",
             bind_ip ? bind_ip : "0.0.0.0", port);
    return true;
}

void mqtt_local_poll(void)
{
    if (s_listen < 0)
    {
        return;
    }

    struct timeval tv = { .tv_sec = 0, .tv_usec = 0 };
    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(s_listen, &rfds);
    int maxfd = s_listen;

    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (s_clients[i].used && s_clients[i].sock >= 0)
        {
            FD_SET(s_clients[i].sock, &rfds);
            if (s_clients[i].sock > maxfd)
            {
                maxfd = s_clients[i].sock;
            }
        }
    }

    if (select(maxfd + 1, &rfds, NULL, NULL, &tv) <= 0)
    {
        return;
    }

    if (FD_ISSET(s_listen, &rfds))
    {
        struct sockaddr_in sa;
        socklen_t sl = sizeof(sa);
        int cs = accept(s_listen, (struct sockaddr *)&sa, &sl);
        if (cs >= 0)
        {
            if (client_alloc(cs) == NULL)
            {
                close(cs);
            }
            else
            {
                ESP_LOGI(TAG, "Opta/client connected from %s", inet_ntoa(sa.sin_addr));
            }
        }
    }

    uint8_t buf[MQTT_LOCAL_BUF_MAX];
    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (!s_clients[i].used || s_clients[i].sock < 0)
        {
            continue;
        }
        if (!FD_ISSET(s_clients[i].sock, &rfds))
        {
            continue;
        }
        ssize_t n = recv(s_clients[i].sock, buf, sizeof(buf), 0);
        if (n <= 0)
        {
            ESP_LOGI(TAG, "client disconnected");
            client_drop(&s_clients[i]);
            continue;
        }
        handle_packet(&s_clients[i], buf, (size_t)n);
    }
}

bool mqtt_local_deliver(const char *topic, const uint8_t *payload, size_t len,
                        int qos, bool retain)
{
    if (topic == NULL || payload == NULL)
    {
        return false;
    }

    uint8_t hdr = 0x30 | (retain ? 0x01 : 0x00) | ((qos & 0x03) << 1);
    char tbuf[MQTT_LOCAL_TOPIC_MAX];
    strncpy(tbuf, topic, sizeof(tbuf) - 1);
    tbuf[sizeof(tbuf) - 1] = '\0';
    size_t tlen = strlen(tbuf);

    uint8_t pkt[MQTT_LOCAL_BUF_MAX];
    size_t off = 0;
    pkt[off++] = hdr;

    uint8_t rl_buf[4];
    size_t body = 2 + tlen + len;
    size_t rl_len = mqtt_encode_rem_len(rl_buf, body);
    memcpy(pkt + off, rl_buf, rl_len);
    off += rl_len;

    pkt[off++] = (uint8_t)(tlen >> 8);
    pkt[off++] = (uint8_t)(tlen & 0xff);
    memcpy(pkt + off, tbuf, tlen);
    off += tlen;

    if (off + len > sizeof(pkt))
    {
        return false;
    }
    memcpy(pkt + off, payload, len);
    off += len;

    bool any = false;
    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (!s_clients[i].used || s_clients[i].sock < 0)
        {
            continue;
        }
        for (int s = 0; s < s_clients[i].sub_count; s++)
        {
            if (topic_matches(s_clients[i].subs[s], topic))
            {
                if (sock_send_all(s_clients[i].sock, pkt, off))
                {
                    any = true;
                }
                break;
            }
        }
    }
    return any;
}

int mqtt_local_client_count(void)
{
    int n = 0;
    for (int i = 0; i < MQTT_LOCAL_MAX_CLIENTS; i++)
    {
        if (s_clients[i].used)
        {
            n++;
        }
    }
    return n;
}

bool mqtt_local_is_listening(void)
{
    return s_listening;
}

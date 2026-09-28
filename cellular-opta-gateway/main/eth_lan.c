/*
 * W5500 Ethernet LAN — LilyGO T-ETH-Elite RJ45 toward Opta.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "eth_lan.h"

#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_eth.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_netif_glue.h"
#include "esp_eth_phy_w5500.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "lwip/inet.h"

static const char *TAG = "eth_lan";

static esp_netif_t *s_eth_netif;
static esp_eth_handle_t s_eth_handle;
static bool s_link_up;
static bool s_spi_bus_owned;

static bool parse_ipv4(const char *s, esp_ip4_addr_t *out)
{
    if (s == NULL || out == NULL)
    {
        return false;
    }
    return inet_aton(s, out) != 0;
}

static void on_eth_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)data;
    switch (id)
    {
        case ETHERNET_EVENT_CONNECTED:
            s_link_up = true;
            ESP_LOGI(TAG, "Ethernet link up");
            break;
        case ETHERNET_EVENT_DISCONNECTED:
            s_link_up = false;
            ESP_LOGW(TAG, "Ethernet link down");
            break;
        case ETHERNET_EVENT_START:
            ESP_LOGI(TAG, "Ethernet driver started");
            break;
        case ETHERNET_EVENT_STOP:
            ESP_LOGW(TAG, "Ethernet driver stopped");
            break;
        default:
            break;
    }
}

static esp_err_t eth_lan_apply_static_ip(const gateway_cfg_t *cfg)
{
    if (s_eth_netif == NULL)
    {
        return ESP_ERR_INVALID_STATE;
    }

    esp_netif_ip_info_t ip_info = { 0 };
    if (!parse_ipv4(cfg->lan_ip, &ip_info.ip) || !parse_ipv4(cfg->lan_mask, &ip_info.netmask))
    {
        ip_info.ip.addr = ESP_IP4TOADDR(192, 168, 1, 1);
        ip_info.netmask.addr = ESP_IP4TOADDR(255, 255, 255, 0);
    }
    ip_info.gw = ip_info.ip;

    ESP_RETURN_ON_ERROR(esp_netif_dhcps_stop(s_eth_netif), TAG, "dhcps_stop");
    ESP_RETURN_ON_ERROR(esp_netif_set_ip_info(s_eth_netif, &ip_info), TAG, "set_ip");
    ESP_RETURN_ON_ERROR(esp_netif_dhcps_start(s_eth_netif), TAG, "dhcps_start");

    esp_netif_dns_info_t dns = { 0 };
    dns.ip.u_addr.ip4 = ip_info.ip;
    esp_netif_set_dns_info(s_eth_netif, ESP_NETIF_DNS_MAIN, &dns);

    ESP_LOGI(TAG, "LAN %s/%s DHCP server for Opta", cfg->lan_ip, cfg->lan_mask);
    return ESP_OK;
}

#if CONFIG_ETH_LAN_ENABLE

static esp_err_t eth_lan_start_w5500(void)
{
    esp_err_t ret = gpio_install_isr_service(0);
    if (ret == ESP_ERR_INVALID_STATE)
    {
        ret = ESP_OK;
    }
    ESP_RETURN_ON_ERROR(ret, TAG, "gpio isr install");

    spi_bus_config_t buscfg = {
        .miso_io_num = CONFIG_ETH_W5500_SPI_MISO,
        .mosi_io_num = CONFIG_ETH_W5500_SPI_MOSI,
        .sclk_io_num = CONFIG_ETH_W5500_SPI_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
    };

    spi_host_device_t host = (spi_host_device_t)CONFIG_ETH_W5500_SPI_HOST;
    ret = spi_bus_initialize(host, &buscfg, SPI_DMA_CH_AUTO);
    if (ret == ESP_ERR_INVALID_STATE)
    {
        ret = ESP_OK;
    }
    else if (ret == ESP_OK)
    {
        s_spi_bus_owned = true;
    }
    ESP_RETURN_ON_ERROR(ret, TAG, "spi_bus_initialize");

    spi_device_interface_config_t spi_devcfg = {
        .mode = 0,
        .clock_speed_hz = CONFIG_ETH_W5500_SPI_MHZ * 1000 * 1000,
        .spics_io_num = CONFIG_ETH_W5500_SPI_CS,
        .queue_size = 20,
    };

    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    mac_config.rx_task_stack_size = 4096;

    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    phy_config.reset_gpio_num = -1;

    eth_w5500_config_t w5500_config = ETH_W5500_DEFAULT_CONFIG(host, &spi_devcfg);
#if CONFIG_ETH_W5500_INT_GPIO >= 0
    w5500_config.base.int_gpio_num = CONFIG_ETH_W5500_INT_GPIO;
    w5500_config.base.poll_period_ms = CONFIG_ETH_W5500_POLL_MS;
#else
    w5500_config.base.int_gpio_num = -1;
    w5500_config.base.poll_period_ms = 20;
#endif

    esp_eth_mac_t *mac = esp_eth_mac_new_w5500(&w5500_config, &mac_config);
    ESP_RETURN_ON_FALSE(mac != NULL, ESP_FAIL, TAG, "w5500 mac");
    esp_eth_phy_t *phy = esp_eth_phy_new_w5500(&phy_config);
    ESP_RETURN_ON_FALSE(phy != NULL, ESP_FAIL, TAG, "w5500 phy");

    esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    ESP_RETURN_ON_ERROR(esp_eth_driver_install(&eth_config, &s_eth_handle), TAG, "eth install");

    uint8_t base_mac[6];
    ESP_RETURN_ON_ERROR(esp_efuse_mac_get_default(base_mac), TAG, "efuse mac");
    uint8_t lan_mac[6];
    esp_derive_local_mac(lan_mac, base_mac);
    ESP_RETURN_ON_ERROR(esp_eth_ioctl(s_eth_handle, ETH_CMD_S_MAC_ADDR, lan_mac), TAG, "set mac");

    esp_eth_netif_glue_handle_t glue = esp_eth_new_netif_glue(s_eth_handle);
    ESP_RETURN_ON_ERROR(esp_netif_attach(s_eth_netif, glue), TAG, "netif attach");
    ESP_RETURN_ON_ERROR(esp_eth_start(s_eth_handle), TAG, "eth start");

    return ESP_OK;
}

#endif

bool eth_lan_init(const gateway_cfg_t *cfg, esp_netif_t **out_netif)
{
    s_link_up = false;
    s_eth_netif = NULL;
    s_eth_handle = NULL;

#if !CONFIG_ETH_LAN_ENABLE
    ESP_LOGW(TAG, "LAN disabled");
    if (out_netif)
    {
        *out_netif = NULL;
    }
    return false;
#else
    esp_event_handler_register(ETH_EVENT, ESP_EVENT_ANY_ID, on_eth_event, NULL);

    esp_netif_config_t eth_netif_cfg = ESP_NETIF_DEFAULT_ETH();
    s_eth_netif = esp_netif_new(&eth_netif_cfg);
    if (s_eth_netif == NULL)
    {
        return false;
    }

    if (eth_lan_start_w5500() != ESP_OK)
    {
        ESP_LOGE(TAG, "W5500 init failed");
        return false;
    }

    if (eth_lan_apply_static_ip(cfg) != ESP_OK)
    {
        ESP_LOGE(TAG, "LAN IP/DHCP setup failed");
        return false;
    }

    if (out_netif)
    {
        *out_netif = s_eth_netif;
    }
    return true;
#endif
}

bool eth_lan_is_up(void)
{
    return s_link_up;
}

void eth_lan_get_ip_str(char *buf, size_t len)
{
    if (buf == NULL || len == 0 || s_eth_netif == NULL)
    {
        return;
    }
    esp_netif_ip_info_t info;
    if (esp_netif_get_ip_info(s_eth_netif, &info) == ESP_OK)
    {
        snprintf(buf, len, IPSTR, IP2STR(&info.ip));
    }
}

int eth_lan_client_count(void)
{
    return s_link_up ? 1 : 0;
}

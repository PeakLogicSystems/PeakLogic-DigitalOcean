idf_component_register(
    SRCS "main.c" "device_cfg.c" "wifi_setup.c" "eth_lan.c" "modem_net.c"
         "mqtt_local.c" "mqtt_bridge.c" "setup_web.c"
    PRIV_REQUIRES driver esp_wifi esp_netif esp_event nvs_flash
                  esp_timer espressif__cjson esp_http_server lwip esp_eth
                  esp_driver_spi esp_driver_gpio esp_driver_uart
                  espressif__mqtt espressif__esp_modem espressif__w5500
    INCLUDE_DIRS "."
)

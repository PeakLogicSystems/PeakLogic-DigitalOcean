idf_component_register(
    SRCS "main.c" "mqtt_parc.c" "sensors.c" "sensor_templates.c" "tx_ah.c"
         "wifi_setup.c" "device_cfg.c" "halow_net.c" "setup_web.c"
    PRIV_REQUIRES driver esp_adc esp_wifi esp_netif esp_event nvs_flash
                  esp_timer espressif__cjson esp_http_server espressif__mqtt
                  esp_driver_gpio esp_driver_uart esp_driver_pcnt
)

# UART display names

Configurator displays UARTs starting at **UART1**, including boards whose firmware names its first hardware UART `UART0`. PIO UARTs similarly display as PIOUART1 onward. USB VCP, soft-serial and LPUART labels retain their existing names.

This is a display convention, not a firmware resource remap. MSP identifiers, CLI setting commands, feature claims and saved assignments remain unchanged. The raw CLI tab and configuration exports still use the firmware's own names.

| Firmware naming | Firmware port | Configurator label |
|---|---|---|
| Zero-based (e.g. current GD32) | UART0 | UART1 |
| Zero-based | UART1 | UART2 |
| One-based (e.g. STM32) | UART1 | UART1 |
| One-based | UART3 | UART3 |
| PIO UART | PIOUART0 | PIOUART1 |

For example, selecting display UART1 for a GD32 receiver retains identifier 50 and sends `set rx_uart = UART0` on firmware using feature-owned CLI assignments. It never sends the display label as a replacement protocol identifier.

The shared display formatter is used by the legacy Ports table, the peripherals tiles, feature-port selectors and port-conflict messages. It identifies zero-based hardware UARTs from the reported UART0 identifier or GD32/RP2040/RP2350/ESP32 MCU/target metadata, so hiding UART0 does not renumber the remaining ports. Existing one-based and legacy identifier blocks remain unchanged. Gaps are preserved rather than compacting a board's available ports.

Board silkscreen labels are manufacturer-specific; the display convention does not infer physical wiring. For the corrected HAKRCF460V2 firmware, physical UART1 pads PB6/PB7 correspond to firmware UART0 and now display as UART1.

No flight-controller settings migration is required for this Configurator change.

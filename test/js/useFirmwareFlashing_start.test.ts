/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { deviceHandler, gui, serialConnect } = vi.hoisted(() => ({
    deviceHandler: {
        devicePicker: { selectedDevice: "noselection" as string | undefined, selectedBauds: 115200 },
        dfuProtocol: { requestPermission: vi.fn(), connect: vi.fn() },
    },
    gui: { connect_lock: false },
    serialConnect: vi.fn(),
}));
vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({}) }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/Analytics", () => ({ tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: {} } }));
vi.mock("../../src/js/protocols/esp32", () => ({ default: {} }));
vi.mock("../../src/js/connection_state", () => ({ getConnectionState: () => ({}) }));
vi.mock("../../src/js/device_handler", () => ({ default: deviceHandler }));
vi.mock("../../src/js/gui", () => ({ default: gui }));
vi.mock("../../src/js/protocols/webstm32", () => ({ default: { connect: serialConnect } }));

import { useFirmwareFlashing } from "../../src/composables/useFirmwareFlashing";

// Local image with its custom-defaults pointer at 0x08002800 and an already
// populated config at 0x08003000. Use the real HEX parser and ConfigInserter.
const localHex = ":020000040800F2\n:08280000003000080040000850\n:043000002342460021\n:00000001FF\n";

describe("starting a local firmware flash", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        deviceHandler.devicePicker.selectedDevice = "noselection";
        deviceHandler.dfuProtocol.requestPermission.mockResolvedValue(null);
        deviceHandler.dfuProtocol.connect.mockResolvedValue(undefined);
        gui.connect_lock = false;
    });

    async function setup(hex = localHex) {
        const flashingMessage = vi.fn();
        const resetFlashingState = vi.fn();
        const setFlashOnConnect = vi.fn();
        const flasher = useFirmwareFlashing({
            flashingMessage,
            FLASH_MESSAGE_TYPES: { INVALID: "invalid" },
            $t: (key: string) => key,
        });
        const loaded = await flasher.processFirmware(hex, "hex", { key: "local.hex", isLocalFile: true });
        expect(loaded).not.toBeNull();
        return {
            flasher,
            flashingMessage,
            options: { config: {}, localFirmwareLoaded: true, resetFlashingState, setFlashOnConnect },
        };
    }

    it("asks for a device without trying to replace the local image's embedded configuration", async () => {
        const { flasher, options } = await setup();
        const original = JSON.stringify(flasher.getParsedHex());
        deviceHandler.dfuProtocol.requestPermission.mockResolvedValue({ path: "usb_selected" });

        await flasher.startFlashing(options);

        expect(deviceHandler.dfuProtocol.requestPermission).toHaveBeenCalledOnce();
        expect(deviceHandler.dfuProtocol.connect).toHaveBeenCalledWith(
            "usb_selected",
            flasher.getParsedHex(),
            expect.any(Object),
            options.resetFlashingState,
        );
        expect(JSON.stringify(flasher.getParsedHex())).toBe(original);
        expect(options.resetFlashingState).not.toHaveBeenCalled();
    });

    it.each(["noselection", "", undefined])(
        "restores the controls after cancelling with selected port %s",
        async (port) => {
            const { flasher, options } = await setup();
            deviceHandler.devicePicker.selectedDevice = port;

            await flasher.startFlashing(options);

            expect(deviceHandler.dfuProtocol.requestPermission).toHaveBeenCalledOnce();
            expect(deviceHandler.dfuProtocol.connect).not.toHaveBeenCalled();
            expect(options.resetFlashingState).toHaveBeenCalledOnce();
            expect(options.setFlashOnConnect).toHaveBeenCalledWith(false);
        },
    );

    it("does not insert an empty config object into a local image with free config space", async () => {
        const { flasher, options } = await setup(localHex.replace(":043000002342460021\n", ""));
        const original = JSON.stringify(flasher.getParsedHex());
        await flasher.startFlashing(options);
        expect(JSON.stringify(flasher.getParsedHex())).toBe(original);
        expect(deviceHandler.dfuProtocol.requestPermission).toHaveBeenCalledOnce();
    });

    it("still inserts explicitly loaded configuration text into a free config area", async () => {
        const { flasher, options } = await setup(localHex.replace(":043000002342460021\n", ""));
        const config = "set craft_name = test";
        await flasher.startFlashing({ ...options, config });
        expect(flasher.getParsedHex().configInserted).toBe(true);
        expect(String.fromCharCode(...flasher.getParsedHex().data.at(-1).data)).toContain(config);
    });

    it("reports a real config insertion failure and releases the progress screen", async () => {
        const { flasher, options, flashingMessage } = await setup();

        await flasher.startFlashing({ ...options, config: "set craft_name = test" });

        expect(deviceHandler.dfuProtocol.requestPermission).not.toHaveBeenCalled();
        expect(deviceHandler.dfuProtocol.connect).not.toHaveBeenCalled();
        expect(options.resetFlashingState).toHaveBeenCalledOnce();
        expect(flashingMessage).toHaveBeenCalledWith("firmwareFlasherFlashFailed", "invalid");
    });

    it("recovers from a rejected device chooser and allows another attempt", async () => {
        const { flasher, options } = await setup();
        deviceHandler.dfuProtocol.requestPermission.mockRejectedValueOnce(new Error("Permission denied"));
        await flasher.startFlashing(options);
        expect(options.resetFlashingState).toHaveBeenCalledOnce();
        deviceHandler.dfuProtocol.requestPermission.mockResolvedValue({ path: "usb_retry" });
        await flasher.startFlashing(options);
        expect(deviceHandler.dfuProtocol.connect).toHaveBeenCalledOnce();
    });

    it.each(["usb_existing", "serial_existing"])("uses an already selected port %s without prompting", async (port) => {
        const { flasher, options } = await setup();
        deviceHandler.devicePicker.selectedDevice = port;
        await flasher.startFlashing(options);
        expect(deviceHandler.dfuProtocol.requestPermission).not.toHaveBeenCalled();
        expect(port.startsWith("usb") ? deviceHandler.dfuProtocol.connect : serialConnect).toHaveBeenCalledOnce();
    });
});

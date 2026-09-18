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

vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({}) }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/ConfigInserter", () => ({ default: {} }));
vi.mock("../../src/js/Analytics", () => ({ tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: {} } }));
vi.mock("../../src/js/workers/hex_parser", () => ({ default: vi.fn() }));
vi.mock("../../src/js/protocols/esp32", () => ({ default: {} }));
vi.mock("../../src/js/device_handler", () => ({ default: {} }));
vi.mock("../../src/js/connection_state", () => ({ getConnectionState: () => ({}) }));

const GUI = { connect_lock: false, flashingInProgress: false };
const STM32 = { rebootMode: 0 };
vi.mock("../../src/js/gui", () => ({ default: GUI }));
vi.mock("../../src/js/protocols/webstm32", () => ({ default: STM32 }));

const { useFirmwareFlashing } = await import("../../src/composables/useFirmwareFlashing");

describe("firmware flasher device removal", () => {
    beforeEach(() => {
        GUI.connect_lock = false;
        GUI.flashingInProgress = false;
        STM32.rebootMode = 0;
    });

    it("preserves the loaded firmware when DFU disconnects during flashing", async () => {
        const onBoardChange = vi.fn();
        const clearBufferedFirmware = vi.fn();
        const updateDfuExitButtonState = vi.fn();
        const flasher = useFirmwareFlashing();
        const { onDeviceRemoved } = flasher.setupFlashingEventListeners({
            onBoardChange,
            clearBufferedFirmware,
            updateDfuExitButtonState,
        });
        GUI.flashingInProgress = true;

        await onDeviceRemoved("usb_gd32");

        expect(onBoardChange).not.toHaveBeenCalled();
        expect(clearBufferedFirmware).not.toHaveBeenCalled();
        expect(updateDfuExitButtonState).not.toHaveBeenCalled();
    });

    it("clears buffered firmware after an idle device removal", async () => {
        const onBoardChange = vi.fn(() => Promise.resolve());
        const clearBufferedFirmware = vi.fn();
        const updateDfuExitButtonState = vi.fn();
        const flasher = useFirmwareFlashing();
        const { onDeviceRemoved } = flasher.setupFlashingEventListeners({
            onBoardChange,
            clearBufferedFirmware,
            updateDfuExitButtonState,
        });

        await onDeviceRemoved("usb_gd32");

        expect(onBoardChange).toHaveBeenCalledWith("0");
        expect(clearBufferedFirmware).toHaveBeenCalledOnce();
        expect(updateDfuExitButtonState).toHaveBeenCalledOnce();
    });
});

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

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/gui", () => ({ default: { connect_lock: false } }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/utils/notifications", () => ({ default: { showNotification: vi.fn() } }));
vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}) }));
vi.mock("../../src/js/protocols/WebUsbDfuTransport", () => ({ default: class extends EventTarget {} }));

const { UsbDfuProtocol } = await import("../../src/js/protocols/usbdfu");

const FLASH_MESSAGE_TYPES = {
    NEUTRAL: "NEUTRAL",
    VALID: "VALID",
    INVALID: "INVALID",
    ACTION: "ACTION",
};

class MockTransport extends EventTarget {
    constructor() {
        super();
        this.releaseInterface = vi.fn(() => Promise.resolve());
        this.close = vi.fn(() => Promise.resolve());
    }

    getConnectedDevice() {
        return null;
    }
}

/**
 * Drive only the option-byte preflight while recording its next action.
 * @param {{vendorId:number, productId:number, address:number, spc:number}} device
 * @returns {{dfu: UsbDfuProtocol, transport: MockTransport, nextActions: number[], messages: object[], callback: ReturnType<typeof vi.fn>}}
 */
function createOptionByteCheck(device) {
    const transport = new MockTransport();
    const dfu = new UsbDfuProtocol(transport);
    const nextActions = [];
    const messages = [];
    const callback = vi.fn(() => messages.push({ message: "reset", type: "RESET" }));
    const originalUploadProcedure = dfu.upload_procedure.bind(dfu);
    let unprotectStarted = false;
    let unprotectStatusRead = false;

    dfu.connectedDevice = device;
    dfu.chipInfo = {
        option_bytes: { start_address: device.address, total_size: 16 },
    };
    dfu.options = {
        flashingMessage: (message, type) => messages.push({ message, type }),
        flashProgress: vi.fn(),
        flashMessageTypes: FLASH_MESSAGE_TYPES,
    };
    dfu.callback = callback;
    dfu._connecting = true;
    dfu.upload_time_start = Date.now();

    dfu.clearStatus = vi.fn((next) => next(new Uint8Array([0, 0, 0, 0, dfu.state.dfuIDLE, 0])));
    dfu.loadAddress = vi.fn((address, next) => {
        next(new Uint8Array([0, 0, 0, 0, dfu.state.dfuDNLOAD_IDLE, 0]));
    });
    dfu.controlTransfer = vi.fn((direction, request, value, interfaceNumber, length, data, next) => {
        if (request === dfu.request.UPLOAD) {
            const optionBytes = new Uint8Array(16);
            optionBytes[1] = device.spc;
            next(optionBytes, 0);
            return;
        }

        if (direction === "out" && request === dfu.request.DNLOAD && data[0] === 0x92) {
            unprotectStarted = true;
            next({ status: "ok" });
            return;
        }

        if (request === dfu.request.GETSTATUS && unprotectStarted) {
            if (!unprotectStatusRead) {
                unprotectStatusRead = true;
                next(new Uint8Array([0, 0, 0, 0, dfu.state.dfuDNBUSY, 0]), 0);
            } else {
                next([], 1);
            }
            return;
        }

        if (request === dfu.request.GETSTATUS) {
            next(new Uint8Array([0, 0, 0, 0, dfu.state.dfuUPLOAD_IDLE, 0]), 0);
        }
    });
    dfu.upload_procedure = vi.fn((action) => {
        if (action === 1) {
            originalUploadProcedure(action);
        } else {
            nextActions.push(action);
        }
    });

    return { dfu, transport, nextActions, messages, callback };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("GD32 DFU read protection", () => {
    it("reads the physical GD32 option-byte address and continues when SPC is 0xAA", () => {
        const context = createOptionByteCheck({
            vendorId: 0x28e9,
            productId: 0x0189,
            address: 0x1ffff800,
            spc: 0xaa,
        });

        context.dfu.upload_procedure(1);

        expect(context.dfu.loadAddress).toHaveBeenCalledWith(0x1fffc000, expect.any(Function), false);
        expect(context.nextActions).toEqual([2]);
        expect(context.callback).not.toHaveBeenCalled();
    });

    it("does not remap the same descriptor address for an STM32 DFU device", () => {
        const context = createOptionByteCheck({
            vendorId: 0x0483,
            productId: 0xdf11,
            address: 0x1ffff800,
            spc: 0xab,
        });

        context.dfu.upload_procedure(1);

        expect(context.dfu.loadAddress).toHaveBeenCalledWith(0x1ffff800, expect.any(Function), false);
        expect(context.nextActions).toEqual([2]);
    });

    it("runs read unprotect for GD32 low protection and cleans up after the expected disconnect", async () => {
        vi.useFakeTimers();
        const context = createOptionByteCheck({
            vendorId: 0x28e9,
            productId: 0x0189,
            address: 0x1ffff800,
            spc: 0xab,
        });

        context.dfu.upload_procedure(1);
        await vi.runAllTimersAsync();

        expect(context.dfu.controlTransfer).toHaveBeenCalledWith(
            "out",
            context.dfu.request.DNLOAD,
            0,
            0,
            0,
            [0x92],
            expect.any(Function),
        );
        expect(context.nextActions).toEqual([]);
        expect(context.callback).toHaveBeenCalledOnce();
        expect(context.dfu._connecting).toBe(false);
        expect(context.messages.at(-1)).toEqual({
            message: "stm32UnprotectUnplug",
            type: FLASH_MESSAGE_TYPES.ACTION,
        });
    });

    it("refuses irreversible GD32 high protection without sending read unprotect", () => {
        const context = createOptionByteCheck({
            vendorId: 0x28e9,
            productId: 0x0189,
            address: 0x1ffff800,
            spc: 0xcc,
        });

        context.dfu.upload_procedure(1);

        const unprotectCalls = context.dfu.controlTransfer.mock.calls.filter(
            ([direction, request, , , , data]) =>
                direction === "out" && request === context.dfu.request.DNLOAD && data?.[0] === 0x92,
        );
        expect(unprotectCalls).toHaveLength(0);
        expect(context.nextActions).toEqual([]);
        expect(context.messages.at(-1)).toEqual({
            message: "gd32HighProtection",
            type: FLASH_MESSAGE_TYPES.INVALID,
        });
        expect(context.callback).toHaveBeenCalledOnce();
    });

    it("invokes the completion callback only once when cleanup is repeated", () => {
        const context = createOptionByteCheck({
            vendorId: 0x28e9,
            productId: 0x0189,
            address: 0x1ffff800,
            spc: 0xcc,
        });

        context.dfu.cleanup();
        context.dfu.cleanup();

        expect(context.callback).toHaveBeenCalledOnce();
    });
});

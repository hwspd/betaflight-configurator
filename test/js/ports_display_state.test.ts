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
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { useFlightControllerStore } from "../../src/stores/fc";
import { usePortsState } from "../../src/composables/ports/usePortsState";

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../../src/js/gui", () => ({ default: { content_ready: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({
    mspHelper: { loadSerialConfig: (callback: () => void) => callback() },
}));

describe("legacy Ports row labels", () => {
    beforeEach(() => setActivePinia(createPinia()));

    it.each([
        { target: "GD32F460RG", ids: [50, 51, 53], names: ["UART1", "UART2", "UART4"] },
        { target: "STM32H743", ids: [51, 53], names: ["UART1", "UART3"] },
    ])("renders one-based names without changing identifiers for $target", async ({ target, ids, names }) => {
        const fc = useFlightControllerStore();
        fc.CONFIG.targetName = target;
        fc.SERIAL_CONFIG.ports = ids.map((identifier) => ({
            identifier,
            functions: identifier === ids[0] ? ["RX_SERIAL"] : [],
            msp_baudrate: "115200",
            gps_baudrate: "57600",
            telemetry_baudrate: "AUTO",
            blackbox_baudrate: "115200",
        }));
        const Harness = defineComponent({
            setup: () => usePortsState(() => []),
            template:
                '<div><span v-for="port in ports" :key="port.identifier">{{ getPortName(port.identifier) }}</span></div>',
        });
        const wrapper = mount(Harness);
        await flushPromises();
        expect(wrapper.findAll("span").map((row) => row.text())).toEqual(names);
        expect(wrapper.vm.ports.map((port) => port.identifier)).toEqual(ids);
        expect(wrapper.vm.ports[0].rxSerial).toBe(true);
        expect(fc.SERIAL_CONFIG.ports.map((port) => port.identifier)).toEqual(ids);
        wrapper.unmount();
    });
});

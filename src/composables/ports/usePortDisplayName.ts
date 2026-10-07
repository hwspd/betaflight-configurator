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

import { getActivePinia } from "pinia";
import { pinia } from "../../js/pinia_instance";
import { useFlightControllerStore } from "../../stores/fc";
import { getPortDisplayName } from "./portNames";

export function usePortDisplayName(): (identifier: number) => string {
    const fc = useFlightControllerStore(getActivePinia() ?? pinia);
    return (identifier) =>
        getPortDisplayName(identifier, {
            ports: fc.SERIAL_CONFIG.ports,
            mcuName: fc.MCU_INFO.name,
            targetName: fc.CONFIG.targetName,
        });
}

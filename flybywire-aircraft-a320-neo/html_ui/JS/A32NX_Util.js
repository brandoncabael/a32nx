const A32NX_Util = {};

A32NX_Util.createDeltaTimeCalculator = (startTime = Date.now()) => {
    let lastTime = startTime;

    return () => {
        const nowTime = Date.now();
        const deltaTime = nowTime - lastTime;
        lastTime = nowTime;

        return deltaTime;
    };
};

A32NX_Util.createFrameCounter = (interval = 5) => {
    let count = 0;
    return () => {
        const c = count++;
        if (c == interval) {
            count = 0;
        }
        return c;
    };
};

A32NX_Util.createMachine = (machineDef) => {
    const machine = {
        value: machineDef.init,
        action(event) {
            const currStateDef = machineDef[machine.value];
            const destTransition = currStateDef.transitions[event];
            if (!destTransition) {
                return;
            }
            const destState = destTransition.target;

            machine.value = destState;
        },
        setState(newState) {
            const valid = machineDef[newState];
            if (valid) {
                machine.value = newState;
            }
        }
    };
    return machine;
};

/**
 * Compute a true heading from a magnetic heading
 * @param {Number} heading true heading
 * @param {Number=} magVar falls back to current aircraft position magvar
 * @returns magnetic heading
 */
A32NX_Util.trueToMagnetic = (heading, magVar) => {
    return (360 + heading - (magVar || SimVar.GetSimVarValue("MAGVAR", "degree"))) % 360;
};

/**
 * Compute a magnetic heading from a true heading
 * @param {Number} heading magnetic heading
 * @param {Number=} magVar falls back to current aircraft position magvar
 * @returns true heading
 */
A32NX_Util.magneticToTrue = (heading, magVar) => {
    return (360 + heading + (magVar || SimVar.GetSimVarValue("MAGVAR", "degree"))) % 360;
};

/**
 * Takes a LatLongAlt or LatLong and returns a vector of spherical co-ordinates
 * @param {(LatLong | LatLongAlt)} ll
 */
A32NX_Util.latLonToSpherical = (ll) => {
    return [
        Math.cos(ll.lat * Avionics.Utils.DEG2RAD) * Math.cos(ll.long * Avionics.Utils.DEG2RAD),
        Math.cos(ll.lat * Avionics.Utils.DEG2RAD) * Math.sin(ll.long * Avionics.Utils.DEG2RAD),
        Math.sin(ll.lat * Avionics.Utils.DEG2RAD)
    ];
};

/**
 * Computes the intersection point of two (true) bearings on a great circle
 * @param {(LatLong | LatLongAlt)} latlon1
 * @param {number} brg1
 * @param {(LatLong | LatLongAlt)} latlon2
 * @param {number} brg2
 */
A32NX_Util.greatCircleIntersection = (latlon1, brg1, latlon2, brg2) => {
    // c.f. https://blog.mbedded.ninja/mathematics/geometry/spherical-geometry/finding-the-intersection-of-two-arcs-that-lie-on-a-sphere/

    const Pa11 = A32NX_Util.latLonToSpherical(latlon1);
    const latlon12 = Avionics.Utils.bearingDistanceToCoordinates(brg1 % 360, 100, latlon1.lat, latlon1.long);
    const Pa12 = A32NX_Util.latLonToSpherical(latlon12);
    const Pa21 = A32NX_Util.latLonToSpherical(latlon2);
    const latlon22 = Avionics.Utils.bearingDistanceToCoordinates(brg2 % 360, 100, latlon2.lat, latlon2.long);
    const Pa22 = A32NX_Util.latLonToSpherical(latlon22);

    const N1 = math.cross(Pa11, Pa12);
    const N2 = math.cross(Pa21, Pa22);

    const L = math.cross(N1, N2);
    const l = math.norm(L);

    const I1 = math.divide(L, l);
    const I2 = math.multiply(I1, -1);

    const s1 = new LatLongAlt(90 - Math.acos(I1[2]) * Avionics.Utils.RAD2DEG, 180 + Math.atan(I1[1] / I1[0]) * Avionics.Utils.RAD2DEG);
    const s2 = new LatLongAlt(90 - Math.acos(I2[2]) * Avionics.Utils.RAD2DEG, 180 + Math.atan(I2[1] / I2[0]) * Avionics.Utils.RAD2DEG);

    const brgTos1 = Avionics.Utils.computeGreatCircleHeading(latlon1, s1);
    const brgTos2 = Avionics.Utils.computeGreatCircleHeading(latlon1, s2);

    const delta1 = Math.abs(brg1 - brgTos1);
    const delta2 = Math.abs(brg1 - brgTos2);

    return delta1 < delta2 ? s1 : s2;
};

/**
 * Utility class to throttle instrument updates
 */
class UpdateThrottler {

    /**
     * @param {number} intervalMs Interval between updates, in milliseconds
     */
    constructor(intervalMs) {
        this.intervalMs = intervalMs;
        this.currentTime = 0;
        this.lastUpdateTime = 0;

        // Take a random offset to space out updates from different instruments among different
        // frames as much as possible.
        this.refreshOffset = Math.floor(Math.random() * intervalMs);
        this.refreshNumber = 0;
    }

    /**
     * Checks whether the instrument should be updated in the current frame according to the
     * configured update interval.
     *
     * @param {number} deltaTime
     * @param {boolean} [forceUpdate = false] - True if you want to force an update during this frame.
     * @returns -1 if the instrument should not update, or the time elapsed since the last
     *          update in milliseconds
     */
    canUpdate(deltaTime, forceUpdate = false) {
        this.currentTime += deltaTime;
        const number = Math.floor((this.currentTime + this.refreshOffset) / this.intervalMs);
        const update = number > this.refreshNumber;
        this.refreshNumber = number;
        if (update || forceUpdate) {
            const accumulatedDelta = this.currentTime - this.lastUpdateTime;
            this.lastUpdateTime = this.currentTime;
            return accumulatedDelta;
        } else {
            return -1;
        }
    }
}

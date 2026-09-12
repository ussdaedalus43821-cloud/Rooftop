// Deterministic PRNG (mulberry32) so a saved seed reproduces the same run.
export class Rng {
    constructor(seed) {
        this.state = seed >>> 0;
    }
    next() {
        this.state |= 0;
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + this.next() * (max - min);
    }
    int(min, maxInclusive) {
        return Math.floor(this.range(min, maxInclusive + 1));
    }
    chance(p) {
        return this.next() < p;
    }
    pick(arr) {
        return arr[this.int(0, arr.length - 1)];
    }
    gaussian(mean, stdev) {
        const u1 = Math.max(this.next(), 1e-9);
        const u2 = this.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stdev;
    }
    getState() {
        return this.state;
    }
    setState(s) {
        this.state = s >>> 0;
    }
}
//# sourceMappingURL=rng.js.map
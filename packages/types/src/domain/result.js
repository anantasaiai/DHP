"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.err = err;
exports.isOk = isOk;
exports.isErr = isErr;
exports.unwrap = unwrap;
exports.mapResult = mapResult;
function ok(value) {
    return { ok: true, value };
}
function err(error) {
    return { ok: false, error };
}
function isOk(result) {
    return result.ok;
}
function isErr(result) {
    return !result.ok;
}
function unwrap(result) {
    if (!result.ok)
        throw result.error;
    return result.value;
}
function mapResult(result, fn) {
    if (!result.ok)
        return result;
    return ok(fn(result.value));
}
//# sourceMappingURL=result.js.map
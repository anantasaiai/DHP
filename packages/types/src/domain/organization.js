"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSubscriptionActive = isSubscriptionActive;
function isSubscriptionActive(org) {
    return org.subscriptionStatus === 'ACTIVE' || org.subscriptionStatus === 'TRIALING';
}
//# sourceMappingURL=organization.js.map
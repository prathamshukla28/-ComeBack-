var ET = globalThis.EventTarget || function () {};
var EV = globalThis.Event || function () {};
module.exports = {
  EventTarget: ET,
  Event: EV,
  defineEventAttribute: function () {},
  setEventAttribute: function () {},
  default: ET,
};

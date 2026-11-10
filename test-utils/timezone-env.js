/**
 * Jest environment that pins the worker's REAL time zone for one test file.
 *
 * Assigning `process.env.TZ` inside a test only touches the sandbox's copy of the
 * environment, so Date keeps using the machine's zone (and a test "pinned" to the
 * developer's own zone passes for the wrong reason). This environment runs in the
 * worker itself, where Node re-reads TZ on assignment, and restores it afterwards.
 *
 *   /**
 *    * @jest-environment ./test-utils/timezone-env.js
 *    * @jest-environment-options {"timezone": "America/Los_Angeles"}
 *    *\/
 */
const ReactNativeEnv = require('react-native/jest/react-native-env.js');

module.exports = class TimezoneEnv extends ReactNativeEnv {
  constructor(config, context) {
    super(config, context);
    this.timezone = config.projectConfig.testEnvironmentOptions?.timezone;
    if (!this.timezone)
      throw new Error('timezone-env: set @jest-environment-options {"timezone": ...}');
  }

  async setup() {
    this.previousTz = process.env.TZ;
    process.env.TZ = this.timezone;
    // Expose the pinned zone so tests can assert it really took effect.
    this.global.__PINNED_TZ__ = this.timezone;
    await super.setup();
  }

  async teardown() {
    if (this.previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTz;
    await super.teardown();
  }
};

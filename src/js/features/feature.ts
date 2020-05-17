import storage from "Lib/storage";
import { FEATURE_IDS as ids } from "Constants";

export type SettingValue = string | number | boolean | Record<string, string>;

export interface Metadata {
  id: string;
  title: string;
  section: string; // TODO: Do it so it can only be a FEATURE_SECTIONS from Constants
  description: string;
  futureFeature?: boolean;
}

export interface SettingsDefaults {
  enabled: boolean;
  [key: string]: SettingValue;
}

export interface SettingsDefinition {
  id: string;
  label: string;
  input: "checkbox";
}

export default abstract class Feature {
  static metadata: Metadata;
  static settingsDefaults: SettingsDefaults;
  static settingDefinitions: SettingsDefinition[] = [];
  static usesSidebar: boolean;

  abstract run(): Promise<void>;

  static isEnabled() {
    return this.getSettings().then((settings) => settings.enabled);
  }

  static enable() {
    return this.saveSetting("enabled", true);
  }

  static disable() {
    return this.saveSetting("enabled", false);
  }

  static async saveSetting(property: string, value: SettingValue) {
    // TODO put these in a queue to avoid race conditions
    // of too many settings being saved at once
    const settings = await this.getSettings();

    // TODO this will be taken care of by the type system once features are
    // ported over to typescript
    if (!(property in this.settingsDefaults)) {
      return Promise.reject(
        new Error(
          `Internal Error: Could not find property "${property}" on feature`
        )
      );
    }

    settings[property] = value;

    return storage.set(this.metadata.id, settings);
  }

  static async getSettings() {
    let settings = await storage.get(this.metadata.id);

    if (!settings) {
      const futureFeatureSettings = await storage.get(ids.FutureFeatureOptIn);
      const disableFutureFeature = futureFeatureSettings?.enabled === false;

      settings = {
        enabled: !disableFutureFeature && !this.metadata.futureFeature,
      };

      if (!this.metadata.futureFeature) {
        // if not a future feature, we should save the settings
        // so that if the future feature setting gets toggled,
        // we still maintain the enabled state
        await storage.set(this.metadata.id, settings);
      }
    }

    return { ...this.settingsDefaults, ...settings };
  }

  static async saveData(key: string, value: SettingValue) {
    return storage.set(`${this.metadata.id}:${key}`, value);
  }

  static async getData(key: string): Promise<SettingValue> {
    return storage.get(`${this.metadata.id}:${key}`);
  }
}

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin that appends proguard-additions.pro into the generated
 * android/app/proguard-rules.pro during `expo prebuild`.
 */
module.exports = function withAndroidProguard(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const proguardFile = path.join(projectRoot, 'app', 'proguard-rules.pro');
      const additionsFile = path.join(__dirname, '..', 'proguard-additions.pro');

      const additions = fs.readFileSync(additionsFile, 'utf8');
      const existing = fs.existsSync(proguardFile)
        ? fs.readFileSync(proguardFile, 'utf8')
        : '';

      const marker = '# --- custom additions ---';
      if (!existing.includes(marker)) {
        fs.writeFileSync(proguardFile, existing + `\n${marker}\n` + additions);
      }

      return config;
    },
  ]);
};

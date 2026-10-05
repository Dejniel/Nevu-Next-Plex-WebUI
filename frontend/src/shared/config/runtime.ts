const defaultConfig: PerPlexed.ConfigOptions = {
  DISABLE_NEVU_SYNC: false,
};

function loadConfig(): PerPlexed.ConfigOptions {
  const storedConfig = localStorage.getItem("config");
  if (!storedConfig) return defaultConfig;

  try {
    return {
      ...defaultConfig,
      ...(JSON.parse(storedConfig) as Partial<PerPlexed.ConfigOptions>),
    };
  } catch {
    return defaultConfig;
  }
}

export const config = loadConfig();

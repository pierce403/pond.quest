/**
 * Fish and plant species definitions.
 * Exported as a JS module so it works in browsers without JSON import assertions.
 * Biology-grounded stats for gameplay simulation.
 */

const speciesDefs = {
  fish: {
    koi: {
      name: "Koi",
      color: 0xff6b35,
      secondaryColor: 0xffffff,
      speed: 60,
      size: 18,
      wasteRate: 0.004,
      oxygenConsumption: 0.002,
      personality: "calm",
      jumpChance: 0.0008,
      description: "Hardy and sociable. Produces significant ammonia but tolerates a wide pH range (6.8–8.2)."
    },
    goldfish: {
      name: "Goldfish",
      color: 0xf4a261,
      secondaryColor: 0xe76f51,
      speed: 75,
      size: 12,
      wasteRate: 0.003,
      oxygenConsumption: 0.0015,
      personality: "curious",
      jumpChance: 0.001,
      description: "Curious and active. Slightly more sensitive to poor water quality than koi."
    },
    shubunkin: {
      name: "Shubunkin",
      color: 0xa8dadc,
      secondaryColor: 0xe63946,
      speed: 85,
      size: 11,
      wasteRate: 0.0025,
      oxygenConsumption: 0.0012,
      personality: "skittish",
      jumpChance: 0.0015,
      description: "Fast and easily startled. Low waste output, good for beginners."
    }
  },
  plants: {
    lotus: {
      name: "Lotus",
      color: 0xf9c74f,
      stemColor: 0x4a7c59,
      padColor: 0x52b788,
      doProduction: 0.003,
      nitrateAbsorption: 0.002,
      growthRate: 0.0002,
      stages: ["seedling", "pad", "budding", "flowering"],
      stageDays: [3, 7, 14, 21],
      description: "Iconic pond plant. Excellent at nitrate uptake; pads shade water reducing algae."
    },
    cattail: {
      name: "Cattail",
      color: 0x8b5e3c,
      stemColor: 0x6a994e,
      doProduction: 0.002,
      nitrateAbsorption: 0.004,
      growthRate: 0.0003,
      stages: ["seedling", "reed", "mature", "seeding"],
      stageDays: [2, 5, 10, 20],
      description: "Marginal plant with exceptional nitrate absorption. Provides cover for fish fry."
    },
    waterlily: {
      name: "Water Lily",
      color: 0xe8b4d8,
      stemColor: 0x40916c,
      padColor: 0x2d6a4f,
      doProduction: 0.0035,
      nitrateAbsorption: 0.0025,
      growthRate: 0.00015,
      stages: ["seedling", "pad", "budding", "blooming"],
      stageDays: [4, 9, 18, 28],
      description: "Beautiful floating pads that shade the pond, reducing water temperature and algae growth."
    },
    hornwort: {
      name: "Hornwort",
      color: 0x386641,
      stemColor: 0x386641,
      doProduction: 0.005,
      nitrateAbsorption: 0.006,
      growthRate: 0.0005,
      stages: ["sprout", "growing", "dense"],
      stageDays: [1, 4, 8],
      description: "Submerged oxygenator. Highest DO production of any starter plant. Excellent biological filter."
    }
  }
};

export default speciesDefs;

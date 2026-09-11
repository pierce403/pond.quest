# Pond Quest simulation

This is a well-mixed, educational freshwater pond model with accelerated time, not a calibrated husbandry predictor. One real second advances 10 game minutes at 1×; 5× and 20× multiply that clock. Plants, bacteria, fish age and water all advance together in fixed one-minute steps. Motion stays calm at every simulation speed. Hidden tabs do not simulate unattended time.

## Units and accounting

| State | Units / meaning |
|---|---|
| `ammonia` | Total ammonia nitrogen (TAN), NH₃-N + NH₄-N, mg N/L |
| `nitrite`, `nitrate`, `detritus` | mg N/L |
| `dissolvedOxygen` | mg O₂/L |
| `alkalinity` | mg/L as CaCO₃ |
| `inorganicCarbon` | mmol C/L |
| `temperature` | °C |
| Plant `nitrogenStored` | mg N in living tissue |
| Plant oxygen / nitrate / ammonium rates | Actual mg O₂/min or mg N/min for that cluster, not concentration changes |
| Fish / plant `age` | Game minutes |

A tile represents 1,000 L. Species rates in `species.json` are concentration rates for a single fish/cluster in 1,000 L; multiply by 1,000 to obtain mg/min, then divide by actual pond volume. These are tunable gameplay estimates for representative adults/clusters, not empirical constants for every fish or plant. Initial nitrate is 2 mg N/L in new ponds; existing saved readings are preserved. Plant transplants bring a small tissue nitrogen inventory into the pond.

Dissolved N + detrital N + plant tissue N is conserved except for fish waste input, new plant additions, and plants removed by the player. Uptake is divided proportionally when nutrients are scarce. Senescence transfers tissue N into detritus; aerobic mineralization returns it to TAN and consumes oxygen. Fish feeding, sediment, phosphorus, algae, evaporation, rain and denitrification are not simulated. Do not describe nitrate directly as water turbidity.

## Water chemistry

- **Ammonia speciation:** `NH₃-N = TAN / (1 + 10^(pKa − pH))`, with `pKa = 0.09018 + 2729.92 / (273.15 + T)`. Toxicity is evaluated against this free ammonia fraction. The HUD labels TAN separately; all N readings use elemental nitrogen units.
- **Nitrification:** Separate ammonia-oxidizing and nitrite-oxidizing colonies respond to substrate, oxygen, pH, temperature and buffer availability. Ammonia → nitrite costs 3.43 mg O₂ and 7.14 mg CaCO₃ per mg N. Nitrite → nitrate costs another 1.14 mg O₂ per mg N. Conversion cannot overdraw either oxygen or alkalinity. Colony capacity is an abstract relative index; warm, fed, buffered colonies establish over weeks, with no guaranteed calendar deadline.
- **Oxygen:** Freshwater sea-level saturation uses the cubic approximation `14.652 − 0.41022T + 0.007991T² − 0.000077774T³` over 0–35 °C. Saturation is a gas-exchange target, not a clipping ceiling: supersaturation can outgas. At fixed depth, increasing surface area and volume together does not magically increase concentration exchange. Surface plant cover reduces exchange.
- **Carbonate buffer:** pH is solved from dissolved inorganic carbon and alkalinity, including bicarbonate, carbonate, H⁺ and OH⁻. Fixed dilute-water pKa values 6.35 and 10.33 and pKw 14 are an approximation. Respiration adds inorganic carbon, aquatic photosynthesis consumes it, and dissolved CO₂ exchanges with the atmosphere. Nitrification consumes buffer. Nitrogen assimilation applies a first-order charge balance. This omits other acid/base systems, ionic strength and temperature corrections to carbonate constants.

Primary references:

- [EPA Nutrient Control Design Manual (2010), §4.4–4.6](https://www.epa.gov/sites/default/files/2019-02/documents/nutrient-control-design-manual.pdf): nitrification stoichiometry and environmental limitations. Game colony growth and exchange coefficients are approximations, not wastewater-reactor design coefficients.
- [UF/IFAS: Ammonia in Aquatic Systems](https://ask.ifas.ufl.edu/publication/FA031), including Emerson et al. (1975): TAN, pH/temperature-dependent un-ionized ammonia and limitations of low alkalinity.
- [USGS: Dissolved Oxygen and Water](https://www.usgs.gov/special-topics/water-science-school/science/dissolved-oxygen-and-water): temperature, atmospheric exchange, photosynthesis, respiration and decomposition. The cubic is a lightweight approximation of the freshwater saturation curve, not the full USGS pressure/salinity calculation.

## Plant behavior

Hornwort exchanges photosynthetic oxygen with the water, but respires at night. Lotus, cattail and water lily leaves mainly exchange gases with air; their simulated contribution to water oxygen is deliberately small. All species assimilate ammonium and nitrate, prefer ammonium when available, and require light, nitrogen, suitable temperature and healthy tissue to grow. Floating cover shades submerged plants and cools the daylight temperature target. Crowded tiles reduce effectiveness.

`stageDays` are milestones of equivalent biological growth time under favorable conditions. They are not guaranteed wall-clock flowering times. Existing `growthProgress` is retained during migration. New transplants start at 8% growth. Cattails require an edge tile; previously placed plants are retained. Placement uses the centers of quarter-tile cells in the same `[0,width] × [0,height]` water polygon as the renderer.

## Persistence and validation

Schema 2 keeps the existing `pondquest_v1` storage key and merges new fields into saved ponds. Legacy ammonia, nitrite and nitrate values retain their numerical values and are interpreted as N units, consistent with the original simulation's 1:1 nitrogen conversions. Legacy pH initializes the carbonate state. Empty saved ponds are not repopulated on reload.

Routine persistence is batched to two wall-clock seconds, with immediate writes for placement/removal and flushes on page hiding/unloading. `npm test` checks chemistry accounting, limiting conditions, time-step consistency, migration, placement coordinates, and a 45-day planted pond. `npm run typecheck` checks the whole source tree. Both run before GitHub Pages builds.

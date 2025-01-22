import { RulesEngine } from '../lib/rules-engine.js';
import { sumAggregator, maxAggregator } from '../lib/aggregators.js';

/**
 * Generate Intersections with random accident/brokenLight flags lazily using a generator function.
 */
function* generateIntersections(count) {
    for (let i = 1; i <= count; i++) {
        yield {
            type: 'Intersection',
            id: `I${i}`,
            vehicleCount: 0,          // Will be computed based on referencing vehicles
            emergencyPresent: false,  // Ditto
            accident: Math.random() < 0.05,     // 5% chance
            brokenLight: Math.random() < 0.05,  // 5% chance
        };
    }
}

/**
 * Generate Vehicles lazily using a generator function. Each Vehicle references a random Intersection by ID.
 */
function* generateVehicles(vehicleCount, intersectionCount) {
    for (let i = 1; i <= vehicleCount; i++) {
        const randomIx = Math.floor(Math.random() * intersectionCount) + 1; // pick an intersection from 1..intersectionCount
        yield {
            type: 'Vehicle',
            vehicleId: `V${i}`,
            intersectionId: `I${randomIx}`,
            driverType: Math.random() < 0.1 ? 'emergency' : 'civilian',
        };
    }
}

/**
 * After generating Intersections and Vehicles, adjust each Intersection's
 * vehicleCount and emergencyPresent based on actual referencing Vehicles.
 */
function reconcileIntersectionsWithVehicles(intersections, vehicles) {
    const tallyMap = new Map();

    // Initialize tally map for intersections
    for (const intersection of intersections) {
        tallyMap.set(intersection.id, {
            totalVehicles: 0,
            hasEmergency: false,
        });
    }

    // Count vehicles referencing each intersection
    for (const vehicle of vehicles) {
        const { intersectionId, driverType } = vehicle;
        const tally = tallyMap.get(intersectionId);
        if (tally) {
            tally.totalVehicles += 1;
            if (driverType === 'emergency') {
                tally.hasEmergency = true;
            }
        }
    }

    // Update the intersection facts accordingly
    intersections.forEach(intersection => {
        const tally = tallyMap.get(intersection.id);
        intersection.vehicleCount = tally ? tally.totalVehicles : 0;
        intersection.emergencyPresent = tally ? tally.hasEmergency : false;
    });
}

// -----------------------------------------------------------------------------
// 1) Generate facts and make them logically consistent
// -----------------------------------------------------------------------------
const NUM_INTERSECTIONS = 100;
const NUM_VEHICLES = 1000;

const intersectionFacts = Array.from(generateIntersections(NUM_INTERSECTIONS));
const vehicleFacts = Array.from(generateVehicles(NUM_VEHICLES, NUM_INTERSECTIONS));

reconcileIntersectionsWithVehicles(intersectionFacts, vehicleFacts);

// -----------------------------------------------------------------------------
// 2) Create the Rules Engine
// -----------------------------------------------------------------------------
const engine = new RulesEngine();

// Insert the facts
intersectionFacts.forEach(f => engine.addFact(f));
vehicleFacts.forEach(f => engine.addFact(f));

// -----------------------------------------------------------------------------
// 3) Add Rules
// -----------------------------------------------------------------------------

// High-priority: If there's an emergency presence (intersection or vehicle)
engine.addRule({
    name: 'EmergencyPriority',
    salience: 100,
    conditions: {
        any: [
            { type: 'Intersection', test: i => i.emergencyPresent === true },
            { type: 'Vehicle', test: v => v.driverType === 'emergency' }
        ]
    },
    action: (facts, eng) => {
        facts.forEach(fact => {
            const data = fact.data;
            if (data.type === 'Intersection') {
                console.log(`[RULE] EmergencyPriority: Intersection ${data.id} => Clearing immediate path for emergency!`);
            } else {
                console.log(`[RULE] EmergencyPriority: Vehicle ${data.vehicleId} => Providing emergency priority route.`);
            }
        });
        eng.addFact({ type: 'Event', name: 'EmergencyOverrideTriggered' });
    }
});

// If an intersection is flagged with an accident, schedule cleanup
engine.addRule({
    name: 'AccidentResponse',
    salience: 80,
    conditions: {
        all: [
            { type: 'Intersection', test: i => i.accident === true }
        ]
    },
    action: (facts, eng) => {
        facts.forEach(fact => {
            console.log(`[RULE] AccidentResponse: Intersection ${fact.data.id} is flagged for accident cleanup.`);
            eng.addFact({ type: 'CleanupQueue', intersectionId: fact.data.id, reason: 'Accident' });
        });
    }
});

// If a traffic light is broken anywhere, dispatch a repair crew
engine.addRule({
    name: 'BrokenLightCheck',
    salience: 70,
    conditions: {
        exists: {
            type: 'Intersection',
            test: i => i.brokenLight === true
        }
    },
    action: (facts, eng) => {
        console.log(`[RULE] BrokenLightCheck: Found at least one broken light. Dispatching repair crew!`);
        eng.addFact({ type: 'Event', name: 'RepairCrewDispatched' });
    }
});

// Citywide congestion if sum of all vehicleCounts > 250
engine.addRule({
    name: 'CitywideCongestion',
    salience: 60,
    conditions: {
        all: [
            {
                type: 'Intersection',
                accumulate: {
                    aggregator: sumAggregator('vehicleCount'),
                    test: sum => sum > 250
                }
            }
        ]
    },
    action: (facts, eng) => {
        console.log(`[RULE] CitywideCongestion: TOTAL vehicles > 250. Major jam declared!`);
        eng.addFact({ type: 'Event', name: 'MajorTrafficJam' });
    }
});

// Localized heavy traffic if max vehicleCount exceeds 80
engine.addRule({
    name: 'LocalizedHeavyTraffic',
    salience: 50,
    conditions: {
        all: [
            {
                type: 'Intersection',
                accumulate: {
                    aggregator: maxAggregator('vehicleCount'),
                    test: maxVal => maxVal > 80
                }
            }
        ]
    },
    action: () => {
        console.log(`[RULE] LocalizedHeavyTraffic: At least one intersection has > 80 vehicles!`);
    }
});

// Beta test: If a vehicle is at an intersection that needs cleanup, detour them
engine.addRule({
    name: 'VehicleAccidentDetour',
    salience: 40,
    conditions: {
        all: [
            { var: 'c', type: 'CleanupQueue', test: c => c.reason === 'Accident' },
            { var: 'v', type: 'Vehicle', test: v => true },
            { test: (facts, bindings) => {
                const cleanup = bindings.c.data;
                const vehicle = bindings.v.data;
                return vehicle.intersectionId === cleanup.intersectionId;
            }
            }
        ]
    },
    action: (facts, eng, bindings) => {
        const { c, v } = bindings;
        console.log(`[RULE] VehicleAccidentDetour: Vehicle ${v.data.vehicleId} at intersection ${v.data.intersectionId} -> detouring!`);
        eng.updateFact(v.id, { detoured: true });
    }
});

// If no major or minor events, assume normal flow
engine.addRule({
    name: 'NormalTrafficCondition',
    salience: 10,
    conditions: {
        all: [
            { not: { type: 'Event', test: e => e.name === 'EmergencyOverrideTriggered' } },
            { not: { type: 'Event', test: e => e.name === 'MajorTrafficJam' } },
            { not: { type: 'Intersection', test: i => i.accident === true } },
            { not: { type: 'Intersection', test: i => i.brokenLight === true } }
        ]
    },
    action: () => {
        console.log(`[RULE] NormalTrafficCondition: No emergencies, accidents, or jams. Traffic is normal.`);
    }
});

// -----------------------------------------------------------------------------
// Run the engine once
// -----------------------------------------------------------------------------
console.log('--- Initial Traffic Management Run ---');
engine.run();

// OPTIONAL: Demonstrate an update—e.g., add an accident to Intersection "I3"
console.log('\n--- Updating Intersection I3 with an accident ---');
const i3Fact = engine.query('Intersection').where(i => i.id === 'I3').execute()[0];
if (i3Fact) {
    engine.updateFact(i3Fact.id, { accident: true });
}

// Run again after the update
console.log('\n--- Second Run After Accident Update ---');
engine.run();

// Check if any vehicles were detoured
const detouredVehicles = engine.query('Vehicle').where(v => v.detoured === true).execute();
if (detouredVehicles.length > 0) {
    console.log(`\nDetoured Vehicles:`, detouredVehicles.map(d => d.data.vehicleId));
} else {
    console.log(`\nNo vehicles were detoured.`);
}

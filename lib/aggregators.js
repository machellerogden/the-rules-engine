// Helper functions for common aggregations
// Support both simple (backward compatible) and incremental forms

// Simple aggregator functions (backward compatible)
export function countAggregator(facts) {
    return facts.length;
}

export function sumAggregator(attr) {
    return facts => facts.reduce((sum, f) => sum + (f.data[attr] || 0), 0);
}

export function maxAggregator(attr) {
    return facts => Math.max(...facts.map(f => f.data[attr]));
}

// Incremental aggregator builders
export function incrementalCount() {
    return {
        initial: () => ({ count: 0, factIds: new Set() }),
        reduce: (state, fact) => {
            if (!state.factIds.has(fact.id)) {
                state.factIds.add(fact.id);
                state.count++;
            }
            return state;
        },
        retract: (state, fact) => {
            if (state.factIds.has(fact.id)) {
                state.factIds.delete(fact.id);
                state.count--;
            }
            return state;
        },
        convert: state => state.count,
        test: () => true
    };
}

export function incrementalSum(attr) {
    return {
        initial: () => ({ sum: 0, values: new Map() }),
        reduce: (state, fact) => {
            const value = fact.data[attr] || 0;
            if (!state.values.has(fact.id)) {
                state.values.set(fact.id, value);
                state.sum += value;
            }
            return state;
        },
        retract: (state, fact) => {
            if (state.values.has(fact.id)) {
                const value = state.values.get(fact.id);
                state.values.delete(fact.id);
                state.sum -= value;
            }
            return state;
        },
        convert: state => state.sum,
        test: () => true
    };
}

export function incrementalMax(attr) {
    return {
        initial: () => ({ values: new Map(), max: null }),
        reduce: (state, fact) => {
            const value = fact.data[attr];
            state.values.set(fact.id, value);
            if (state.max === null || value > state.max) {
                state.max = value;
            }
            return state;
        },
        retract: (state, fact) => {
            state.values.delete(fact.id);
            // Recompute max after removal
            if (state.values.size === 0) {
                state.max = null;
            } else {
                state.max = Math.max(...state.values.values());
            }
            return state;
        },
        convert: state => state.max,
        test: () => true
    };
}

export function collectAll() {
    return {
        initial: () => ({ items: new Map() }),
        reduce: (state, fact) => {
            state.items.set(fact.id, fact);
            return state;
        },
        retract: (state, fact) => {
            state.items.delete(fact.id);
            return state;
        },
        convert: state => Array.from(state.items.values()),
        test: () => true
    };
}

import { jest } from '@jest/globals';
import { RulesEngine } from '../index.js';
import { collectAll, incrementalCount, incrementalSum, incrementalMax } from '../lib/aggregators.js';

describe('Aggregator Tests', () => {
    let engine;

    beforeEach(() => {
        engine = new RulesEngine();
    });

    it('should return empty array with collectAll when no facts exist', () => {
        let collectedFacts = null;
        let ruleFired = false;

        engine.addRule({
            name: 'collect-all-products',
            conditions: {
                type: 'Product',
                var: 'allProducts',
                accumulate: collectAll()
            },
            action: (facts, engine, bindings) => {
                ruleFired = true;
                collectedFacts = bindings.allProducts;
            }
        });

        // Run with no Product facts
        engine.run();

        expect(ruleFired).toBe(true);
        expect(Array.isArray(collectedFacts)).toBe(true);
        expect(collectedFacts).toHaveLength(0);
    });

    it('should work with collectAll aggregator and var binding', () => {
        let collectedFacts = null;

        engine.addRule({
            name: 'collect-all-products',
            conditions: {
                type: 'Product',
                var: 'allProducts',
                accumulate: collectAll()
            },
            action: (facts, engine, bindings) => {
                // The collected facts should be available in bindings
                collectedFacts = bindings.allProducts;
            }
        });

        engine.addFact({ type: 'Product', name: 'Widget', price: 10 });
        engine.addFact({ type: 'Product', name: 'Gadget', price: 20 });

        engine.run();

        expect(collectedFacts).toHaveLength(2);
        expect(collectedFacts[0].data.name).toBe('Widget');
        expect(collectedFacts[1].data.name).toBe('Gadget');
    });

    it('should work with incrementalCount aggregator and var binding', () => {
        let boundCount = null;

        engine.addRule({
            name: 'count-products',
            conditions: {
                type: 'Product',
                var: 'count',
                accumulate: incrementalCount()
            },
            action: (facts, engine, bindings) => {
                // The count should be available in bindings
                boundCount = bindings.count;
            }
        });

        engine.addFact({ type: 'Product', name: 'Widget' });
        engine.addFact({ type: 'Product', name: 'Gadget' });
        engine.run();

        expect(boundCount).toBe(2);
    });

    it('should work with incrementalSum aggregator and var binding', () => {
        let boundSum = null;

        engine.addRule({
            name: 'sum-prices',
            conditions: {
                type: 'Product',
                var: 'total',
                accumulate: incrementalSum('price')
            },
            action: (facts, engine, bindings) => {
                // The sum should be available in bindings
                boundSum = bindings.total;
            }
        });

        engine.addFact({ type: 'Product', name: 'Widget', price: 10 });
        engine.addFact({ type: 'Product', name: 'Gadget', price: 20 });
        engine.addFact({ type: 'Product', name: 'Gizmo', price: 15 });
        engine.run();

        expect(boundSum).toBe(45);
    });

    it('should work with incrementalMax aggregator and var binding', () => {
        let boundMax = null;

        engine.addRule({
            name: 'max-price',
            conditions: {
                type: 'Product',
                var: 'maxPrice',
                accumulate: incrementalMax('price')
            },
            action: (facts, engine, bindings) => {
                // The max should be available in bindings
                boundMax = bindings.maxPrice;
            }
        });

        engine.addFact({ type: 'Product', name: 'Widget', price: 10 });
        engine.addFact({ type: 'Product', name: 'Gadget', price: 20 });
        engine.addFact({ type: 'Product', name: 'Gizmo', price: 15 });
        engine.run();

        expect(boundMax).toBe(20);
    });

    it('should fire accumulator rules as facts change', () => {
        let accumulatorFireCount = 0;
        let regularFireCount = 0;
        const counts = [];

        // Regular rule that adds more facts
        engine.addRule({
            name: 'add-more-products',
            salience: 10,
            conditions: {
                type: 'Product',
                test: p => !p.processed
            },
            action: (facts, engine) => {
                regularFireCount++;
                facts.forEach(f => {
                    engine.addFact({
                        type: 'Product',
                        name: f.data.name + '-copy',
                        price: f.data.price * 2,
                        processed: true
                    });
                });
            }
        });

        // Accumulator rule
        engine.addRule({
            name: 'count-all-products',
            conditions: {
                type: 'Product',
                var: 'totalCount',
                accumulate: incrementalCount()
            },
            action: (facts, engine, bindings) => {
                accumulatorFireCount++;
                counts.push(bindings.totalCount);
            }
        });

        engine.addFact({ type: 'Product', name: 'Widget', price: 10 });
        engine.addFact({ type: 'Product', name: 'Gadget', price: 20 });

        engine.run();

        // Regular rule fires twice (once for each unprocessed product)
        expect(regularFireCount).toBe(2);
        // Accumulator fires twice: once with 2 products, once with 4
        expect(accumulatorFireCount).toBe(2);
        expect(counts).toEqual([2, 4]);
    });
});
import { jest } from '@jest/globals';
import { RulesEngine } from '../index.js';

describe('RulesEngine Extended Tests', () => {
    let engine;

    beforeEach(() => {
        engine = new RulesEngine();
    });

    // ---------------------------------------------------------------------------
    // 1. Logical Operators: Edge & Negative Cases
    // ---------------------------------------------------------------------------

    test('any with multiple children, some produce no matches', () => {
        engine.addFact({ type: 'Animal', species: 'cat' });
        engine.addFact({ type: 'Animal', species: 'dog' });

        const actionSpy = jest.fn();

        // We'll create 3 child conditions:
        // - Condition 1 matches 'cat'
        // - Condition 2 matches nothing
        // - Condition 3 matches 'dog'
        engine.addRule({
            name: 'AnyAnimalRule',
            conditions: {
                any: [
                    { type: 'Animal', test: a => a.species === 'cat' },
                    { type: 'Animal', test: a => a.species === 'horse' }, // no matches
                    { type: 'Animal', test: a => a.species === 'dog' }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // The 'any' node should match both cat and dog, so we expect 2 separate matches
        // Without a uniqueness check, the rule might fire for cat and then for dog
        // If your engine merges them, you might get 2 calls or 1 call. Let's assume 2 calls:
        expect(actionSpy).toHaveBeenCalledTimes(2);
    });

    test('all with 3 children, middle fails', () => {
        engine.addFact({ type: 'Animal', species: 'cat', friendly: true });
        engine.addFact({ type: 'Animal', species: 'dog', friendly: true });

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'AllThreeConditions',
            conditions: {
                all: [
                    { type: 'Animal', test: a => a.friendly === true },
                    // This second condition will fail because we expect species === 'bird'
                    { type: 'Animal', test: a => a.species === 'bird' },
                    { type: 'Animal', test: a => a.friendly === true }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // We expect zero matches because the middle condition fails for all animals
        expect(actionSpy).toHaveBeenCalledTimes(0);
    });

    test('not nested within any', () => {
        engine.addFact({ type: 'Entity', status: 'Expired' });
        engine.addFact({ type: 'Entity', status: 'Active' });

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'NestedNotAnyRule',
            conditions: {
                any: [
                    // Condition #1: Not an Expired entity
                    { not: { type: 'Entity', test: e => e.status === 'Expired' } },
                    // Condition #2: An entity that is explicitly 'Active'
                    { type: 'Entity', test: e => e.status === 'Active' }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // Condition #1 fails because we do have an 'Expired' entity in memory
        // But Condition #2 matches the 'Active' entity
        // So the any block overall should match (because #2 passes)
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    test('exists with all nested, no matches', () => {
        engine.addFact({ type: 'Item', category: 'clothing' });
        // We want to find at least one item with category 'food' that is also 'organic'

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'ExistsAllNested',
            conditions: {
                all: [
                    { exists: {
                        all: [
                            { type: 'Item', test: i => i.category === 'food' },
                            { type: 'Item', test: i => i.organic === true }
                        ]
                    }
                    }
                ]
            },
            action: actionSpy
        });

        engine.run();
        expect(actionSpy).toHaveBeenCalledTimes(0);
    });

    // ---------------------------------------------------------------------------
    // 2. BetaTestNode: Advanced Cases
    // ---------------------------------------------------------------------------

    test('multiple consecutive beta tests', () => {
        engine.addFact({ type: 'Person', name: 'Abby', age: 22 });
        engine.addFact({ type: 'Event', category: 'Birthday', personName: 'Abby' });

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'ConsecutiveBetaTests',
            conditions: {
                all: [
                    { var: 'p', type: 'Person', test: p => p.age >= 18 },
                    { var: 'e', type: 'Event', test: e => e.category === 'Birthday' },
                    // First beta test: confirm event's personName matches person's name
                    { test: (facts, bindings) => {
                        return bindings.e.data.personName === bindings.p.data.name;
                    }
                    },
                    // Second beta test: person must have name starting with 'A'
                    { test: (facts, bindings) => {
                        return bindings.p.data.name.startsWith('A');
                    }
                    }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // Should pass both beta tests
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    test('beta test that fails all matches', () => {
        engine.addFact({ type: 'Person', name: 'Ben', age: 30 });
        engine.addFact({ type: 'Event', category: 'Birthday', personName: 'Ben' });

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'FailingBetaTest',
            conditions: {
                all: [
                    { var: 'p', type: 'Person', test: p => p.age >= 18 },
                    { var: 'e', type: 'Event', test: e => e.category === 'Birthday' },
                    { test: (facts, bindings) => {
                        // Always return false
                        return false;
                    }}
                ]
            },
            action: actionSpy
        });

        engine.run();
        expect(actionSpy).toHaveBeenCalledTimes(0);
    });

    test('beta test with no alpha nodes in all: []', () => {
        // This depends on how your engine handles an empty 'all' block or a top-level beta test.
        // If your compiler throws an error or has a NoFactNode fallback, test accordingly.

        const actionSpy = jest.fn();

        // This block has zero alpha conditions, only a beta test
        // Some engines interpret all:[] as "match everything" or "match nothing".
        // Then the beta test runs, but might have no bindings or facts.
        engine.addRule({
            name: 'BetaTestNoAlpha',
            conditions: {
                all: [
                    { test: (facts, bindings) => {
                        // If there's no alpha node, we might get an empty partial match set
                        // Suppose we define a fallback that returns one empty partial match?
                        // Then facts = [], bindings = {}
                        return facts.length === 0;
                    }}
                ]
            },
            action: actionSpy
        });

        engine.run();
        // If your engine's design yields one empty match,
        // the beta test returns true => action fires once
        // If your engine throws an error, you'd expect a test that catches that error instead.
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    // ---------------------------------------------------------------------------
    // 3. Accumulators: More Edge Cases
    // ---------------------------------------------------------------------------

    test('accumulator with no matching facts (empty)', () => {
        // aggregator expects an empty array => result is 0
        // check if test can handle that
        const actionSpy = jest.fn();

        engine.addRule({
            name: 'EmptyAccumulatorTest',
            conditions: {
                all: [
                    {
                        type: 'Person',
                        test: p => p.age > 200,  // impossible
                        accumulate: {
                            aggregator: facts => facts.length,
                            test: count => count > 0
                        }
                    }
                ]
            },
            action: actionSpy
        });

        engine.run();
        expect(actionSpy).toHaveBeenCalledTimes(0);
    });

    test('accumulator returning non-numeric result', () => {
        // aggregator that returns earliest date among matched facts
        engine.addFact({ type: 'Log', date: new Date('2021-01-02') });
        engine.addFact({ type: 'Log', date: new Date('2021-01-01') });

        const actionSpy = jest.fn();

        engine.addRule({
            name: 'DateAccumulatorRule',
            conditions: {
                all: [
                    {
                        type: 'Log',
                        accumulate: {
                            aggregator: logs => {
                                // Return the earliest date
                                if (logs.length === 0) return null;
                                return logs.reduce((earliest, log) =>
                                    log.data.date < earliest ? log.data.date : earliest,
                                    logs[0].data.date
                                );
                            },
                            test: d => d && d.getUTCFullYear() === 2021
                        }
                    }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // We should get 1 match => aggregator is earliest date => test passes => action fires
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    // ---------------------------------------------------------------------------
    // 4. Conflict Resolution and Agenda
    // ---------------------------------------------------------------------------

    test('no matches at all => empty agenda', () => {
        // Insert no facts
        const actionSpy = jest.fn();

        engine.addRule({
            name: 'NoFactsRule',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age === 999 }
                ]
            },
            action: actionSpy
        });

        engine.run();
        expect(actionSpy).toHaveBeenCalledTimes(0);
    });

    test('same scenario repeated does not fire again (firedHistory)', () => {
        engine.addFact({ type: 'Person', name: 'Lara', age: 25 });

        const actionSpy = jest.fn();
        engine.addRule({
            name: 'AdultOnceAgain',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age > 18 }
                ]
            },
            action: actionSpy
        });

        engine.run();
        // Should fire once
        engine.run(); // No new facts => shouldn't fire again
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    test('max cycles guard triggers error', () => {
        // Create a rule that re-inserts a new fact every cycle
        engine.addRule({
            name: 'InfiniteLoopRule',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age > 18 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Person', age: 19, uniqueId: Math.random() });
            }
        });

        // Insert an initial Person to bootstrap
        engine.addFact({ type: 'Person', age: 20 });

        expect(() => {
            engine.run();
        }).toThrowError(/Max cycles/);
    });

    // ---------------------------------------------------------------------------
    // 5. Error and Exception Handling
    // ---------------------------------------------------------------------------

    test('invalid condition schema - both type and all in same object', () => {
        engine.addFact({ type: 'Dummy', value: 123 });
        // compiler should throw an error when bad rule is added
        expect(() => {
            engine.addRule({
                name: 'BadDSLRule',
                conditions: {
                    all: [
                        // This condition is nonsense: has 'type' plus 'all' nested
                        { type: 'Dummy', all: [{ type: 'SomethingElse' }] }
                    ]
                },
                action: () => {}
            });
        }).toThrow();
        engine.run();
    });

    test('beta test at top level (no logical operator)', () => {
        // Beta test at the top level
        const actionSpy = jest.fn();

        engine.addRule({
            name: 'TopLevelBetaTest',
            conditions: {
                test: (facts, bindings) => facts.length === 0 // Matches "nothing" case
            },
            action: actionSpy
        });

        engine.run();
        expect(actionSpy).toHaveBeenCalledTimes(1); // Beta test runs once
    });

    // ---------------------------------------------------------------------------
    // 6. Query Tests
    // ---------------------------------------------------------------------------

    test('query with no type - return all facts', () => {
        engine.addFact({ type: 'Person', name: 'Mike', age: 30 });
        engine.addFact({ type: 'Car', make: 'Toyota' });

        const results = engine.query().execute(); // no type => getAll
        expect(results.length).toBe(2);
    });

    test('query with complex predicate', () => {
        engine.addFact({ type: 'Product', name: 'Apple', category: 'Fruit', price: 2 });
        engine.addFact({ type: 'Product', name: 'Banana', category: 'Fruit', price: 1 });
        engine.addFact({ type: 'Product', name: 'Bread', category: 'Bakery', price: 3 });

        const fruitsUnder3 = engine.query('Product')
        .where(p => p.category === 'Fruit' && p.price < 3)
        .execute();

        expect(fruitsUnder3.length).toBe(2);
        const names = fruitsUnder3.map(f => f.data.name).sort();
        expect(names).toEqual(['Apple', 'Banana']);
    });
});

test('fact retraction removes fact from memory and stops matching', () => {
    const engine = new RulesEngine();
    engine.addFact({ type: 'Fruit', name: 'Apple' });
    engine.addFact({ type: 'Fruit', name: 'Banana' });

    const actionSpy = jest.fn();

    engine.addRule({
        name: 'FruitRule',
        conditions: {
            all: [{ type: 'Fruit', test: f => f.name !== '' }]
        },
        action: actionSpy
    });

    engine.run();
    // Should match Apple, Banana => 2 fires
    expect(actionSpy).toHaveBeenCalledTimes(2);

    // Now retract Banana
    const bananaFact = engine.query('Fruit')
        .where(f => f.name === 'Banana')
        .execute()[0];
    engine.removeFact(bananaFact.id);

    // Re-run
    engine.run();
    // No new "banana" matches => only "Apple" remains
    // The rule for Apple scenario was already fired, so no new matches
    // => Zero new calls
    expect(actionSpy).toHaveBeenCalledTimes(2);
    const remaining = engine.query('Fruit').execute();
    expect(remaining.map(f => f.data.name)).toEqual(['Apple']);
});

test('updating a fact triggers new matches if not previously fired', () => {
    const engine = new RulesEngine();
    const itemFact = engine.addFact({ type: 'Item', status: 'draft', description: 'Test item' });

    const actionSpy = jest.fn();

    // Rule only matches items with status=published
    engine.addRule({
        name: 'PublishItem',
        conditions: {
            all: [{ type: 'Item', test: i => i.status === 'published' }]
        },
        action: actionSpy
    });

    engine.run();
    expect(actionSpy).toHaveBeenCalledTimes(0);

    // Update from 'draft' to 'published'
    engine.updateFact(itemFact.id, { status: 'published' });

    // Re-run
    engine.run();
    // Now it should match => fires 1 time
    expect(actionSpy).toHaveBeenCalledTimes(1);
});

test('recency resolves conflicts when salience is equal', () => {
    const engine = new RulesEngine();

    // Two rules with the same salience
    engine.addRule({
        name: 'SameSalienceRule1',
        salience: 10,
        conditions: { all: [{ type: 'Person', test: p => p.age > 18 }] },
        action: () => {}
    });
    engine.addRule({
        name: 'SameSalienceRule2',
        salience: 10,
        conditions: { all: [{ type: 'Person', test: p => p.age > 18 }] },
        action: () => {}
    });

    // Insert two people
    const fact1 = engine.addFact({ type: 'Person', name: 'Alice', age: 20 });
    const fact2 = engine.addFact({ type: 'Person', name: 'Bob', age: 22 });

    // Update Bob to bump recency
    engine.updateFact(fact2.id, { age: 23 });

    // Collect raw matches
    const rawAgenda = engine.collectMatches();

    // Apply conflict resolution, which sorts by salience and then recency
    const resolvedAgenda = engine.defaultConflictResolver(rawAgenda);

    // Now check order
    expect(resolvedAgenda.length).toBe(4); // Both rules match both people
    const [first, second, third, fourth] = resolvedAgenda;

    // Bob's recency is higher => his matches appear first
    expect(first.match.facts[0].data.name).toBe('Bob');
    expect(second.match.facts[0].data.name).toBe('Bob');
    expect(third.match.facts[0].data.name).toBe('Alice');
    expect(fourth.match.facts[0].data.name).toBe('Alice');
});

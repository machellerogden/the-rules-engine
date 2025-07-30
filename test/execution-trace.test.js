import { RulesEngine } from '../lib/rules-engine.js';

describe('Execution Trace', () => {
    describe('with tracing enabled', () => {
        let engine;

        beforeEach(() => {
            engine = new RulesEngine({ trace: true });
        });

    test('should start with empty execution trace', () => {
        expect(engine.getExecutionTrace()).toEqual([]);
    });

    test('should track rule execution', () => {
        // Add a simple rule
        engine.addRule({
            name: 'TestRule',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age >= 18 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Status', status: 'adult' });
            }
        });

        // Add a fact that triggers the rule
        engine.addFact({ type: 'Person', age: 25 });

        // Run the engine
        engine.run();

        // Check execution trace
        const trace = engine.getExecutionTrace();
        expect(trace).toHaveLength(1);
        expect(trace[0].ruleName).toBe('TestRule');
        expect(trace[0].facts).toEqual([{ type: 'Person', age: 25 }]);
        expect(trace[0].factsAdded).toEqual([{ type: 'Status', status: 'adult' }]);
        expect(trace[0].timestamp).toBeDefined();
    });

    test('should track multiple rule executions', () => {
        // Add rules
        engine.addRule({
            name: 'AdultCheck',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age >= 18 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Status', status: 'adult' });
            }
        });

        engine.addRule({
            name: 'SeniorCheck',
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age >= 65 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Status', status: 'senior' });
            }
        });

        // Add a fact that triggers both rules
        engine.addFact({ type: 'Person', age: 70 });

        // Run the engine
        engine.run();

        // Check execution trace
        const trace = engine.getExecutionTrace();
        expect(trace).toHaveLength(2);
        
        const ruleNames = trace.map(t => t.ruleName);
        expect(ruleNames).toContain('AdultCheck');
        expect(ruleNames).toContain('SeniorCheck');
    });

    test('should track multiple facts added by a single rule', () => {
        engine.addRule({
            name: 'MultiFactRule',
            conditions: {
                all: [
                    { type: 'Order', test: o => o.total > 100 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Discount', amount: 10 });
                eng.addFact({ type: 'Shipping', free: true });
                eng.addFact({ type: 'Loyalty', points: 50 });
            }
        });

        engine.addFact({ type: 'Order', total: 150 });
        engine.run();

        const trace = engine.getExecutionTrace();
        expect(trace).toHaveLength(1);
        expect(trace[0].factsAdded).toHaveLength(3);
        expect(trace[0].factsAdded).toEqual([
            { type: 'Discount', amount: 10 },
            { type: 'Shipping', free: true },
            { type: 'Loyalty', points: 50 }
        ]);
    });

    test('should clear trace on new run', () => {
        // Add a rule
        engine.addRule({
            name: 'SimpleRule',
            conditions: {
                all: [
                    { type: 'Test', test: t => t.value === true }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Result', success: true });
            }
        });

        // First run
        engine.addFact({ type: 'Test', value: true });
        engine.run();
        expect(engine.getExecutionTrace()).toHaveLength(1);

        // Second run - should clear previous trace
        engine.addFact({ type: 'Test', value: true });
        engine.run();
        expect(engine.getExecutionTrace()).toHaveLength(1); // Not 2
    });

    test('should handle rules that do not add facts', () => {
        let sideEffect = false;
        
        engine.addRule({
            name: 'NoFactRule',
            conditions: {
                all: [
                    { type: 'Trigger', test: t => t.fire === true }
                ]
            },
            action: () => {
                sideEffect = true;
                // No facts added
            }
        });

        engine.addFact({ type: 'Trigger', fire: true });
        engine.run();

        const trace = engine.getExecutionTrace();
        expect(trace).toHaveLength(1);
        expect(trace[0].ruleName).toBe('NoFactRule');
        expect(trace[0].factsAdded).toEqual([]);
        expect(sideEffect).toBe(true);
    });

    test('should track chain reactions', () => {
        // Rule 1: Person -> Adult
        engine.addRule({
            name: 'CheckAdult',
            salience: 100,
            conditions: {
                all: [
                    { type: 'Person', test: p => p.age >= 18 }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Adult', personId: facts[0].data.id });
            }
        });

        // Rule 2: Adult -> Benefits
        engine.addRule({
            name: 'GrantBenefits',
            salience: 50,
            conditions: {
                all: [
                    { type: 'Adult' }
                ]
            },
            action: (facts, eng) => {
                eng.addFact({ type: 'Benefits', granted: true });
            }
        });

        engine.addFact({ type: 'Person', id: 1, age: 25 });
        engine.run();

        const trace = engine.getExecutionTrace();
        expect(trace).toHaveLength(2);
        expect(trace[0].ruleName).toBe('CheckAdult');
        expect(trace[0].factsAdded[0].type).toBe('Adult');
        expect(trace[1].ruleName).toBe('GrantBenefits');
        expect(trace[1].factsAdded[0].type).toBe('Benefits');
    });
    });

    describe('with tracing disabled (default)', () => {
        let engine;

        beforeEach(() => {
            engine = new RulesEngine(); // No options, tracing disabled by default
        });

        test('should not track execution', () => {
            engine.addRule({
                name: 'TestRule',
                conditions: {
                    all: [
                        { type: 'Person', test: p => p.age >= 18 }
                    ]
                },
                action: (facts, eng) => {
                    eng.addFact({ type: 'Status', status: 'adult' });
                }
            });

            engine.addFact({ type: 'Person', age: 25 });
            engine.run();

            // Execution trace should remain empty
            const trace = engine.getExecutionTrace();
            expect(trace).toEqual([]);
        });

        test('should still execute rules normally', () => {
            let ruleExecuted = false;
            
            engine.addRule({
                name: 'TestRule',
                conditions: {
                    all: [
                        { type: 'Test', test: t => t.value === true }
                    ]
                },
                action: () => {
                    ruleExecuted = true;
                }
            });

            engine.addFact({ type: 'Test', value: true });
            engine.run();

            expect(ruleExecuted).toBe(true);
            expect(engine.getExecutionTrace()).toEqual([]);
        });
    });
});
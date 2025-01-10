/**
 * A rule typically looks like:
 * {
 *   name: 'SomeName',
 *   conditions: { ... },
 *   action: (facts, engine, bindings) => { ... },
 *   salience: number,
 *   rootNode: [compiled node tree]   // <-- assigned at runtime
 * }
 */
export class ProductionRule {
    constructor({ name, conditions, action, salience, rootNode }) {
        this.name = name;
        this.conditions = conditions;  // Original DSL (for reference)
        this.action = action;
        this.salience = salience;

        // The compiled node tree for evaluating this rule:
        this.rootNode = rootNode;
    }
}

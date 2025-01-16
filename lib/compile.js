import {
    AlphaNode,
    BetaTestNode,
    LogicalAllNode,
    LogicalAnyNode,
    LogicalNotNode,
    LogicalExistsNode,
    AccumulatorNode,
    NoFactNode
} from './nodes.js';

function isBetaTestCondition(c) {
    return c.test && !c.type && !c.all && !c.any && !c.not && !c.exists && !c.accumulate;
}

// We’ll store encountered types in a set, returned by compileConditions
export function compileConditions(conditions, inComposite = false, referencedTypes = new Set()) {
    const hasType = typeof conditions.type === 'string';
    const hasComposite = Boolean(conditions.all || conditions.any || conditions.not || conditions.exists);
    const hasTest = typeof conditions.test === 'function';

    if (hasType && hasComposite) {
        throw new Error("Invalid DSL: A condition cannot have both 'type' and composite fields like 'all', 'any', 'not', or 'exists'.");
    }
    if (hasComposite && hasTest) {
        throw new Error("Invalid DSL: A condition cannot have both 'test' and composite fields.");
    }
    if (hasType && hasTest && hasComposite) {
        throw new Error("Invalid DSL: A condition cannot have 'type', 'test', and composite fields.");
    }

    if (hasTest && !hasType && !hasComposite) {
        // Beta-only condition
        if (!inComposite) {
            // Top-level beta test => wrap in NoFactNode
            return new BetaTestNode(new NoFactNode(), conditions.test);
        } else {
            // Embedded inside parent => return marker
            return { betaTest: conditions.test };
        }
    }

    // If composite
    if (conditions.all) {
        return compileLogicalNode(conditions.all, 'all', referencedTypes);
    } else if (conditions.any) {
        return compileLogicalNode(conditions.any, 'any', referencedTypes);
    } else if (conditions.not) {
        return new LogicalNotNode(compileConditions(conditions.not, true, referencedTypes));
    } else if (conditions.exists) {
        return new LogicalExistsNode(compileConditions(conditions.exists, true, referencedTypes));
    }

    // Otherwise, it's an alpha or accumulator
    if (hasType) {
        referencedTypes.add(conditions.type);
        const { type, test, var: varName, accumulate } = conditions;
        const alpha = new AlphaNode({ type, test, varName });
        if (accumulate) {
            const { aggregator, test: accTest } = accumulate;
            return new AccumulatorNode({ childNode: alpha, aggregator, accTest });
        } else {
            return alpha;
        }
    }
}

function compileLogicalNode(subConditions, operatorType, referencedTypes) {
    const alphaAndLogicalNodes = [];
    const betaTests = [];

    for (const c of subConditions) {
        const result = compileConditions(c, true, referencedTypes);

        if (result && result.betaTest) {
            betaTests.push(result.betaTest);
        } else {
            alphaAndLogicalNodes.push(result);
        }
    }

    let combinedNode;
    if (alphaAndLogicalNodes.length === 0) {
        // only beta tests
        combinedNode = new NoFactNode();
    } else if (alphaAndLogicalNodes.length === 1) {
        combinedNode = alphaAndLogicalNodes[0];
    } else {
        if (operatorType === 'all') {
            combinedNode = new LogicalAllNode(alphaAndLogicalNodes);
        } else {
            combinedNode = new LogicalAnyNode(alphaAndLogicalNodes);
        }
    }

    for (const testFn of betaTests) {
        combinedNode = new BetaTestNode(combinedNode, testFn);
    }

    return combinedNode;
}

export function initializeNodesWithWMI(rootNode, wmi) {
    if (rootNode.setWMI) {
        rootNode.setWMI(wmi);
    }
}

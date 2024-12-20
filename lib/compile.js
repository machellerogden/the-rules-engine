import { AlphaNode, BetaTestNode, LogicalAllNode, LogicalAnyNode, LogicalNotNode, LogicalExistsNode, AccumulatorNode, NoFactNode } from './nodes.js';

function isBetaTestCondition(c) {
    return c.test && !c.type && !c.all && !c.any && !c.not && !c.exists && !c.accumulate;
}

export function compileConditions(conditions, inComposite = false) {
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
        // Now we differentiate top-level vs embedded:
        if (!inComposite) {
            // Top-level: wrap in NoFactNode
            return new BetaTestNode(new NoFactNode(), conditions.test);
        } else {
            // Embedded inside a parent "all/any" => return a marker for BetaTest
            return { betaTest: conditions.test };
        }
    }

    if (conditions.all) {
        return compileLogicalNode(conditions.all, 'all');
    } else if (conditions.any) {
        return compileLogicalNode(conditions.any, 'any');
    } else if (conditions.not) {
        return new LogicalNotNode(compileConditions(conditions.not, true));
    } else if (conditions.exists) {
        return new LogicalExistsNode(compileConditions(conditions.exists, true));
    }

    // Handle alpha conditions
    if (hasType) {
        // It's an alpha or accumulator condition
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

function compileLogicalNode(subConditions, operatorType) {
    const alphaAndLogicalNodes = [];
    const betaTests = [];

    for (const c of subConditions) {
        const result = compileConditions(c, true);

        if (result && result.betaTest) {
            // Store the beta test function to apply later
            betaTests.push(result.betaTest);
        } else {
            // This is an alpha or composite node, store it
            alphaAndLogicalNodes.push(result);
        }
    }

    // Now combine all alpha/logical nodes
    let combinedNode;
    if (alphaAndLogicalNodes.length === 0) {
        // If we have only beta tests and no alpha nodes,
        // that doesn't really make sense, but let's handle gracefully:
        // A beta test alone without facts? Let's create a dummy node that returns one empty match.
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

    // Apply beta tests (each wraps the current node)
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

import { WorkingMemoryIndexer } from './working-memory-indexer.js';
import { ProductionRule } from './production-rule.js';
import { compileConditions, initializeNodesWithWMI } from './compile.js';
import { Query } from './query.js';
import { Fact } from './fact.js';

const DEFAULT_MAX_CYCLES = 100;

export class RulesEngine {
    constructor(options = {}) {
        this.wmi = new WorkingMemoryIndexer();
        this.rules = [];
        this.cycleCount = 0;
        this.firedHistory = new Set();
        this.conflictResolver = this.defaultConflictResolver;
        this.trace = options.trace === true;
        this.executionTrace = [];
        this.maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
    }

    addFact(factData) {
        const fact = new Fact(factData);
        this.wmi.insertFact(fact);
        return fact;
    }

    updateFact(factId, newData) {
        this.wmi.updateFact(factId, newData);
    }

    removeFact(factId) {
        this.wmi.removeFact(factId);
    }

    addRule(ruleDef) {
        // We create a local set to track which types this rule references
        const referencedTypes = new Set();
        const hasNegation = { value: false };
        const rootNode = compileConditions(ruleDef.conditions, false, referencedTypes, hasNegation);
        initializeNodesWithWMI(rootNode, this.wmi);

        const salience = (typeof ruleDef.salience === 'number') ? ruleDef.salience : 0;
        const rule = new ProductionRule({
            ...ruleDef,
            salience,
            rootNode
        });

        // Store the set of all alpha types referenced by this rule:
        // If it's empty => purely beta or no-fact rule
        rule.referencedTypes = referencedTypes;
        // Store whether this rule contains negation
        rule.hasNegation = hasNegation.value;

        this.rules.push(rule);
        return rule;
    }

    query(type) {
        return new Query(this.wmi, type);
    }

    setConflictResolver(resolverFn) {
        this.conflictResolver = resolverFn;
    }

    run() {
        this.cycleCount = 0;
        this.clearExecutionTrace();

        while (this.cycleCount < this.maxCycles) {
            // 1) "Promote" any newly dirtied types to current dirty set for this cycle
            this.wmi.promoteNextCycleDirty();

            // 2) Gather matches. We skip alpha if no intersection with *current* dirty set
            const agenda = this.collectMatches(true /* we still skip alpha if no dirty intersection */);

            // If no matches at all => stable, break out
            if (agenda.length === 0) {
                break;
            }

            this.cycleCount++;

            // Conflict resolution
            const resolvedAgenda = this.conflictResolver(agenda);

            // Fire matches
            const somethingFired = this.fireMatches(resolvedAgenda);

            // If nothing fired => stable
            if (!somethingFired) {
                break;
            }

            this.wmi.clearDirtyCurrentCycle();
        }

        if (this.cycleCount >= this.maxCycles) {
            throw new Error(`Max cycles (${this.maxCycles}) reached. Possible infinite loop.`);
        }
    }

    /**
     * We collect matches from all rules, but we skip rules that reference only alpha types
     * that are currently not dirty—*unless* the rule references no types at all (in which case
     * we always evaluate it).
     */
    collectMatches(skipCleanAlpha = false) {
        const agenda = [];

        for (const rule of this.rules) {
            const { referencedTypes, rootNode, name, salience, hasNegation } = rule;

            // If purely beta (no alpha types), always evaluate it
            if (referencedTypes.size === 0) {
                const matches = rootNode.evaluateAndGetPartialMatches();
                for (const match of matches) {
                    const signature = this.buildMatchSignature(name, match);
                    const matchRecency = match.facts.length > 0
                        ? Math.max(...match.facts.map(f => f.recency))
                        : 0;
                    agenda.push({ rule, match, signature, salience, matchRecency });
                }
                continue;
            }

            // Rules with negation must always be evaluated because absence of facts is meaningful
            if (skipCleanAlpha && !hasNegation) {
                // Check dirty types for the current cycle via
                // getDirtyTypesCurrentCycle()
                const dirtyTypes = this.wmi.getDirtyTypesCurrentCycle();
                const intersectsDirty = dirtyTypes.some(dt => referencedTypes.has(dt));
                if (!intersectsDirty) {
                    // skip evaluating => no new matches
                    continue;
                }
            }

            // Evaluate normally (accumulator nodes maintain their state incrementally)
            const matches = rootNode.evaluateAndGetPartialMatches();
            for (const match of matches) {
                const signature = this.buildMatchSignature(name, match);
                const matchRecency = Math.max(...match.facts.map(f => f.recency));
                agenda.push({ rule, match, signature, salience, matchRecency });
            }
        }

        return agenda;
    }

    buildMatchSignature(ruleName, match) {
        // Always use fact IDs for signatures
        // This allows accumulators to fire multiple times as facts change
        const factIds = match.facts.map(f => f.id.toString()).sort().join(',');
        return `${ruleName}::${factIds}`;
    }

    defaultConflictResolver(agenda) {
        const filtered = agenda.filter(a => !this.firedHistory.has(a.signature));
        filtered.sort((a, b) => {
            // Sort primarily by salience desc
            const salienceDiff = b.salience - a.salience;
            if (salienceDiff !== 0) return salienceDiff;

            // Then by recency desc
            const recencyDiff = b.matchRecency - a.matchRecency;
            if (recencyDiff !== 0) return recencyDiff;

            // Finally, fallback to signature
            return a.signature.localeCompare(b.signature);
        });
        return filtered;
    }

    fireMatches(resolvedAgenda) {
        let somethingFired = false;
        for (const { rule, match, signature } of resolvedAgenda) {
            if (this.trace) {
                // Track execution before firing
                const executionEntry = {
                    ruleName: rule.name,
                    timestamp: Date.now(),
                    facts: match.facts.map(f => f.data),
                    factsAdded: []
                };

                // Intercept addFact to track what this rule adds
                const originalAddFact = this.addFact.bind(this);
                this.addFact = (factData) => {
                    executionEntry.factsAdded.push(factData);
                    return originalAddFact(factData);
                };

                // Fire the rule
                rule.action(match.facts, this, match.bindings);

                // Restore original addFact
                this.addFact = originalAddFact;

                this.executionTrace.push(executionEntry);
            } else {
                // Fire the rule without tracking
                rule.action(match.facts, this, match.bindings);
            }

            this.firedHistory.add(signature);
            somethingFired = true;
        }
        return somethingFired;
    }

    getExecutionTrace() {
        return this.executionTrace;
    }

    clearExecutionTrace() {
        this.executionTrace = [];
    }
}

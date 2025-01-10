import { WorkingMemoryIndexer } from './working-memory-indexer.js';
import { ProductionRule } from './production-rule.js';
import { compileConditions, initializeNodesWithWMI } from './compile.js';
import { Query } from './query.js';
import { Fact } from './fact.js';

const MAX_CYCLES = 100;

export class RulesEngine {
    constructor() {
        this.wmi = new WorkingMemoryIndexer();
        this.rules = [];
        this.cycleCount = 0;
        this.firedHistory = new Set();
        this.conflictResolver = this.defaultConflictResolver;
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

    /**
     * Add a rule, compiling the conditions immediately into a node tree,
     * then storing it in the ProductionRule for reuse.
     */
    addRule(ruleDef) {
        const salience = (typeof ruleDef.salience === 'number') ? ruleDef.salience : 0;
        const rootNode = compileConditions(ruleDef.conditions);
        initializeNodesWithWMI(rootNode, this.wmi);

        const rule = new ProductionRule({
            ...ruleDef,
            salience,
            rootNode
        });
        this.rules.push(rule);
        return rule;
    }

    query(type) {
        return new Query(this.wmi, type);
    }

    setConflictResolver(resolverFn) {
        this.conflictResolver = resolverFn;
    }

    /**
     * The main run loop. Repeats until no new rules fire or max cycles reached.
     * After each iteration, we clear the 'dirty' types so that the alpha nodes
     * can do partial checks next time if needed.
     */
    run() {
        let somethingFired = true;
        while (somethingFired && this.cycleCount < MAX_CYCLES) {
            this.cycleCount++;
            // 1. Collect all matches from all rules
            const agenda = this.collectMatches();

            // 2. Resolve conflicts (filter out repeats, sort by salience & recency, etc.)
            const resolvedAgenda = this.conflictResolver(agenda);

            // 3. Fire the selected matches
            somethingFired = this.fireMatches(resolvedAgenda);

            // 4. Clear dirty flags after this cycle
            this.wmi.clearDirty();
        }

        if (this.cycleCount >= MAX_CYCLES) {
            throw new Error(`Max cycles (${MAX_CYCLES}) reached. Possible infinite loop.`);
        }
    }

    /**
     * Evaluate each rule's node tree. For partial Rete, we could do more advanced checks,
     * but here we do a simple approach:
     *   - If the rule node references any types that are dirty, recompile or re-check.
     *   - If it's not referencing a dirty type, we could skip. (Optional)
     *
     * For now, we'll just evaluate all rules whenever anything is dirty.
     */
    collectMatches() {
        // Potential optimization: check if nothing is dirty => skip re-check. But let’s keep it simple.
        const agenda = [];
        for (const rule of this.rules) {
            const matches = rule.rootNode.evaluateAndGetPartialMatches();
            for (const match of matches) {
                // signature for firedHistory
                const factIds = match.facts.map(f => f.id.toString()).sort().join(',');
                const signature = `${rule.name}::${factIds}`;

                // Store recency on the match: the max recency of all involved facts
                const matchRecency = Math.max(...match.facts.map(f => f.recency));

                agenda.push({
                    rule,
                    match,
                    signature,
                    salience: rule.salience,
                    matchRecency
                });
            }
        }
        return agenda;
    }

    /**
     * Default conflict resolver:
     *   1) Filter out matches that have fired before (refractoriness).
     *   2) Sort by salience DESC, then recency DESC, then signature as tiebreaker.
     */
    defaultConflictResolver(agenda) {
        const filtered = agenda.filter(a => !this.firedHistory.has(a.signature));
        filtered.sort((a, b) => {
            // Sort primarily by salience desc
            const salienceDiff = b.salience - a.salience;
            if (salienceDiff !== 0) return salienceDiff;

            // Then by recency desc
            const recencyDiff = b.matchRecency - a.matchRecency;
            if (recencyDiff !== 0) return recencyDiff;

            // Finally, fallback to signature for stability
            return a.signature.localeCompare(b.signature);
        });
        return filtered;
    }

    /**
     * Fire all matches in the resolved agenda for this cycle.
     */
    fireMatches(resolvedAgenda) {
        let somethingFired = false;
        for (const { rule, match, signature } of resolvedAgenda) {
            rule.action(match.facts, this, match.bindings);
            this.firedHistory.add(signature);
            somethingFired = true;
        }
        return somethingFired;
    }
}

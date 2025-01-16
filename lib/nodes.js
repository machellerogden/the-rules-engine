export class AlphaNode {
    constructor({ type, test, varName }) {
        this.type = type;
        this.test = test || (() => true);
        this.varName = varName;
        this.matches = new Set();
        this.wmi = null;
        // Cache the partial matches result to skip re-checking
        this._cachedPartialMatches = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
    }

    evaluate() {
        // Clear in-memory matches for the new evaluation
        this.matches.clear();
        if (!this.wmi) throw new Error('WMI not set on AlphaNode.');

        // If the type is not dirty AND we have a cached partial match set,
        // we can skip recomputing. Just restore from the cache.
        if (!this.wmi.isTypeDirty(this.type) && this._cachedPartialMatches) {
            // re-populate matches so that toPartialMatches() is correct if called
            for (const pm of this._cachedPartialMatches) {
                // each pm.facts is typically 1 fact in an alpha node
                const fact = pm.facts[0];
                if (fact) this.matches.add(fact);
            }
            return this.matches;
        }

        // Otherwise, do a full scan for this type
        const candidates = this.wmi.getByType(this.type);
        for (const fact of candidates) {
            if (this.test(fact.data)) {
                this.matches.add(fact);
            }
        }
        return this.matches;
    }

    toPartialMatches() {
        const result = [];
        for (const fact of this.matches) {
            const bindings = {};
            if (this.varName) {
                bindings[this.varName] = fact;
            }
            result.push({ facts: [fact], bindings });
        }
        return result;
    }

    evaluateAndGetPartialMatches() {
        this.evaluate();
        // Convert the matches to partial matches
        const pm = this.toPartialMatches();
        // Cache them so next cycle can skip re-check
        this._cachedPartialMatches = pm;
        return pm;
    }
}

export class AccumulatorNode {
    constructor({ childNode, aggregator, accTest }) {
        this.childNode = childNode;
        this.aggregator = aggregator;
        this.accTest = accTest;
        this.results = [];
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        if (this.childNode.setWMI) this.childNode.setWMI(wmi);
    }

    evaluateAndGetPartialMatches() {
        const childMatches = this.childNode.evaluateAndGetPartialMatches();
        const allFacts = childMatches.reduce((acc, pm) => acc.concat(pm.facts), []);
        const aggResult = this.aggregator(allFacts);
        if (this.accTest(aggResult)) {
            this.results = [{ facts: allFacts, bindings: {} }];
        } else {
            this.results = [];
        }
        return this.results;
    }
}

export class LogicalAllNode {
    constructor(children) {
        this.children = children;
        this.results = [];
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        this.children.forEach(c => c.setWMI && c.setWMI(wmi));
    }

    evaluateAndGetPartialMatches() {
        const childMatchesArrays = this.children.map(c => c.evaluateAndGetPartialMatches());
        if (childMatchesArrays.some(m => m.length === 0)) {
            this.results = [];
            return this.results;
        }

        let combination = childMatchesArrays[0];
        for (let i = 1; i < childMatchesArrays.length; i++) {
            combination = joinPartialMatches(combination, childMatchesArrays[i]);
            if (combination.length === 0) break;
        }

        this.results = combination;
        return this.results;
    }
}

export class LogicalAnyNode {
    constructor(children) {
        this.children = children;
        this.results = [];
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        this.children.forEach(c => c.setWMI && c.setWMI(wmi));
    }

    evaluateAndGetPartialMatches() {
        let unionResults = [];
        for (const c of this.children) {
            const res = c.evaluateAndGetPartialMatches();
            unionResults = unionResults.concat(res);
        }
        this.results = unionResults;
        return this.results;
    }
}

export class LogicalNotNode {
    constructor(child) {
        this.child = child;
        this.results = [];
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        if (this.child.setWMI) this.child.setWMI(wmi);
    }

    evaluateAndGetPartialMatches() {
        const childMatches = this.child.evaluateAndGetPartialMatches();
        if (childMatches.length === 0) {
            this.results = [{ facts: [], bindings: {} }];
        } else {
            this.results = [];
        }
        return this.results;
    }
}

export class LogicalExistsNode {
    constructor(child) {
        this.child = child;
        this.results = [];
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        if (this.child.setWMI) this.child.setWMI(wmi);
    }

    evaluateAndGetPartialMatches() {
        const childMatches = this.child.evaluateAndGetPartialMatches();
        if (childMatches.length > 0) {
            this.results = [{ facts: [], bindings: {} }];
        } else {
            this.results = [];
        }
        return this.results;
    }
}

function joinPartialMatches(leftMatches, rightMatches) {
    const result = [];
    for (const l of leftMatches) {
        for (const r of rightMatches) {
            const unified = unifyBindings(l, r);
            if (unified) {
                const facts = l.facts.concat(r.facts);
                result.push({ facts, bindings: unified });
            }
        }
    }
    return result;
}

function unifyBindings(pm1, pm2) {
    const unified = { ...pm1.bindings };
    for (const [k, v] of Object.entries(pm2.bindings)) {
        if (unified.hasOwnProperty(k)) {
            if (unified[k] !== v) {
                return null; // conflict
            }
        } else {
            unified[k] = v;
        }
    }
    return unified;
}

export class BetaTestNode {
    constructor(childNode, testFn) {
        this.childNode = childNode;
        this.testFn = testFn;
        this.wmi = null;
    }

    setWMI(wmi) {
        this.wmi = wmi;
        if (this.childNode.setWMI) this.childNode.setWMI(wmi);
    }

    evaluateAndGetPartialMatches() {
        const childMatches = this.childNode.evaluateAndGetPartialMatches();
        return childMatches.filter(pm => {
            return this.testFn(pm.facts, pm.bindings);
        });
    }
}

export class NoFactNode {
  setWMI(wmi) {
    // no-op
  }

  evaluateAndGetPartialMatches() {
    // Always return a single default match
    return [{ facts: [], bindings: {} }];
  }
}

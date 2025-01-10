export class WorkingMemoryIndexer {
    constructor() {
        this.typeIndex = new Map();  // type -> Set of facts
        this.versionCounter = 1;     // increments on each insert/update, used for recency
        // For partial Rete: we’ll keep a simple “dirty” set of types that changed
        this.dirtyTypes = new Set();
    }

    /**
     * Insert a new fact into working memory, assign recency.
     */
    insertFact(fact) {
        fact.recency = this.versionCounter++;
        let typeSet = this.typeIndex.get(fact.data.type);
        if (!typeSet) {
            typeSet = new Set();
            this.typeIndex.set(fact.data.type, typeSet);
        }
        typeSet.add(fact);

        // Mark this fact's type as dirty, so alpha nodes re-check next run
        this.dirtyTypes.add(fact.data.type);
    }

    /**
     * Update an existing fact in working memory.
     * If not found, does nothing or throws an error (up to you).
     * For partial Rete, we mark the type as dirty.
     *
     * @param {number} factId  The unique ID of the fact
     * @param {object} newData Key-values to merge into the fact's data
     */
    updateFact(factId, newData) {
        // Find the fact among all types
        const fact = this._findFactById(factId);
        if (!fact) {
            throw new Error(`updateFact: No fact found with ID ${factId}`);
        }

        // If the type changes, we'd need to remove + insert. For now, disallow type changes:
        if (newData.type && newData.type !== fact.data.type) {
            throw new Error(
                `Cannot change fact's type from "${fact.data.type}" to "${newData.type}". ` +
                'Remove and re-insert as a new fact if you must change type.'
            );
        }

        // Merge the newData
        Object.assign(fact.data, newData);

        // Bump recency
        fact.recency = this.versionCounter++;

        // Mark dirty
        this.dirtyTypes.add(fact.data.type);
    }

    /**
     * Remove a fact from working memory by ID.
     * Mark its type as dirty for re-check.
     *
     * @param {number} factId
     */
    removeFact(factId) {
        const fact = this._findFactById(factId);
        if (!fact) {
            throw new Error(`removeFact: No fact found with ID ${factId}`);
        }

        const typeSet = this.typeIndex.get(fact.data.type);
        if (typeSet) {
            typeSet.delete(fact);
            if (typeSet.size === 0) {
                this.typeIndex.delete(fact.data.type);
            }
        }

        // Mark dirty
        this.dirtyTypes.add(fact.data.type);
    }

    /**
     * Return an array of all facts of a given type.
     */
    getByType(type) {
        return Array.from(this.typeIndex.get(type) || []);
    }

    /**
     * Return an array of ALL facts from all types.
     */
    allFacts() {
        let all = [];
        for (const set of this.typeIndex.values()) {
            all = all.concat(Array.from(set));
        }
        return all;
    }

    /**
     * Clear the 'dirtyTypes' set, used to indicate that
     * alpha nodes might need re-evaluation for those types.
     */
    clearDirty() {
        this.dirtyTypes.clear();
    }

    /**
     * Return a new array of types that have changed since last run.
     */
    getDirtyTypes() {
        return Array.from(this.dirtyTypes);
    }

    /**
     * Internal helper to find any fact by ID.
     * This is an O(#facts) operation in the naive approach.
     */
    _findFactById(factId) {
        for (const set of this.typeIndex.values()) {
            for (const fact of set) {
                if (fact.id === factId) {
                    return fact;
                }
            }
        }
        return null;
    }
}

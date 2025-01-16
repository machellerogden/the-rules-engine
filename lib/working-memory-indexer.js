export class WorkingMemoryIndexer {
    constructor() {
        this.typeIndex = new Map();  // type -> Set of facts
        this.versionCounter = 1;     // increments on each insert/update, used for recency
        this.dirtyTypesCurrentCycle = new Set();
        this.dirtyTypesNextCycle = new Set();
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

        // Mark newly inserted fact's type as dirty for the *next* cycle
        this.dirtyTypesNextCycle.add(fact.data.type);
    }

    /**
     * Update an existing fact in working memory.
     */
    updateFact(factId, newData) {
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
        this.dirtyTypesNextCycle.add(fact.data.type);
    }

    /**
     * Remove a fact from working memory by ID.
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
        this.dirtyTypesNextCycle.add(fact.data.type);
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

    clearDirtyCurrentCycle() {
        // Clears the types that were already dirty for the current cycle
        this.dirtyTypesCurrentCycle.clear();
    }

    promoteNextCycleDirty() {
        // Move newly dirtied types into the current cycle set
        for (const t of this.dirtyTypesNextCycle) {
            this.dirtyTypesCurrentCycle.add(t);
        }
        this.dirtyTypesNextCycle.clear();
     }

     getDirtyTypesCurrentCycle() {
        return Array.from(this.dirtyTypesCurrentCycle);
     }

    /**
     * Return a new array of types that have changed since last run.
     */
    getDirtyTypes() {
        return Array.from(this.dirtyTypes);
    }

    /**
     * Helper to check if a certain type is dirty.
     */
    isTypeDirty(type) {
        return (
            this.dirtyTypesCurrentCycle.has(type) ||
                this.dirtyTypesNextCycle.has(type)
        );
    }

    /**
     * Internal helper to find any fact by ID.
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

# The Rules Engine

> A forward-chaining rules engine for JavaScript applications, offering a robust DSL, logical composition, accumulators, and conflict resolution.

## Introduction

The Rules Engine is a powerful, forward-chaining inference engine that allows you to define rules declaratively. Each rule expresses a set of conditions on your domain data (the facts) and an action to be performed when those conditions hold true. The engine can chain these actions together, continually reacting to changes in your data until no new rules can fire. Whether you're modeling game logic, business policies, or reactive event processing, this engine aims to make complex conditional logic more maintainable.

### When and Why to Use

  - **Complex Decision Logic:** If/else blocks get unwieldy. This engine provides structure.
  - **Forward-Chaining:** Automatically re-checks rules after each change, perfect for real-time or dynamic applications.
  - **Declarative DSL:** Express business/policy logic in a readable, modular format.
  - **Extensible and Customizable:** Plug in your own conflict resolution strategies, aggregator functions, or specialized condition tests.

## Installation

```sh
npm install the-rules-engine
```

Then in your JavaScript/TypeScript file:

```js
import { RulesEngine } from 'the-rules-engine';
```

Or for older Node versions:

```js
const { RulesEngine } = require('the-rules-engine');
```

## Quick Start

The following is a minimal example showing how to add facts, define a rule, and run the engine.

```js
import { RulesEngine } from 'the-rules-engine';

// Step 1: Create an engine
const engine = new RulesEngine();
// Or with custom options:
// const engine = new RulesEngine({ maxCycles: 50, trace: true });

// Step 2: Insert facts
engine.addFact({ type: 'Person', name: 'Alice', age: 30 });
engine.addFact({ type: 'Event', category: 'Birthday', personName: 'Alice' });

// Step 3: Add rules
engine.addRule({
  name: 'AdultBirthdayRule',
  salience: 10, // optional priority
  conditions: {
    all: [
      { var: 'p', type: 'Person', test: p => p.age >= 18 },
      { var: 'e', type: 'Event', test: e => e.category === 'Birthday' },
      // Beta test referencing existing variable bindings:
      { test: (facts, bindings) => bindings.e.data.personName === bindings.p.data.name }
    ]
  },
  action: (facts, engine, bindings) => {
    console.log(`Happy Birthday, ${bindings.p.data.name}!`);
  }
});

// Step 4: Run the engine
engine.run();
// => Outputs: "Happy Birthday, Alice!"
```

That's it! The engine processes your facts against all defined rules. If a rule's conditions are satisfied, the corresponding action fires.

## Features

### Declarative DSL

Compose conditions using all, any, not, and exists. Build complex nested condition graphs with ease.

### Forward-Chaining

After each rule fires, new facts or updates can trigger additional rules in subsequent cycles.

### Typed Facts & Working Memory

Facts are stored in a specialized in-memory index keyed by type, making retrieval quick.

### Alpha & Beta Nodes

Internally, conditions are compiled into a network of alpha (type-based) and beta (cross-binding) nodes, allowing fine-grained logic.

### Accumulators

Sum, count, or otherwise aggregate sets of matching facts and apply a final test to the aggregated result (e.g., sum > 10).

### Salience & Conflict Resolution

Prioritize rules with numeric salience. Customize conflict resolution to determine which rules fire first when multiple matches coexist.

### Safe Guardrails

Built-in measures prevent infinite loops by tracking fired scenarios and limiting maximum engine cycles.

### Queryable Memory

Query facts in memory with flexible predicates and filters for post-processing or advanced logic.

## Detailed Documentation

This section dives deep into each component of the engine, with code snippets and conceptual explanations. We'll walk through Core Concepts, how to Work with Facts, how to Define Rules using the DSL, and more advanced features like accumulators, beta tests, and conflict resolution.

### Core Concepts

  - **Fact:** A piece of data shaped like `{ type: string, ...restOfProperties }`. Each fact is stored in the engine's working memory.
  - **Condition:** A declarative statement that describes a pattern of data you want to match. Conditions can be nested logically or specify custom aggregator logic.
  - **Action:** A function that executes when conditions are met. It can modify the working memory by adding, updating, or removing facts.
  - **Rule:** Combines one or more conditions and an action. Optionally includes a salience for priority.
  - **Working Memory Indexer:** Maintains an internal index of all facts, keyed by type, and tracks "dirty" or recently changed types to optimize evaluation.
  - **Engine Cycle:** Each time you call engine.run(), the engine attempts to stabilize by repeatedly matching rules and firing actions until no further changes occur or a maximum cycle limit is reached.

### Engine Configuration

The RulesEngine constructor accepts an options object:

```js
const engine = new RulesEngine({
  maxCycles: 50,  // Maximum number of rule execution cycles (default: 100)
  trace: true     // Enable execution tracing for debugging (default: false)
});
```

#### Options:

  - **maxCycles** (number): Sets the maximum number of cycles the engine will run before throwing an error to prevent infinite loops. Default is 100.
  - **trace** (boolean): When true, the engine tracks detailed execution information that can be retrieved via `engine.getExecutionTrace()`. Default is false.

### Working with Facts

Facts must have a type property. Beyond that, they can contain any structure. Here's how to manage them in the engine:

#### Adding Facts

```js
const fact = engine.addFact({ type: 'Person', name: 'Aragorn', age: 87 });
```

  - Returns a Fact object with a unique ID assigned.

#### Updating Facts

```js
engine.updateFact(fact.id, { age: 88, name: 'Aragorn II' });
```

  - Merges new data into the existing fact, bumps its recency (used in conflict resolution), and marks it for re-evaluation in the next cycle.

#### Removing Facts

```js
engine.removeFact(fact.id);
```

  - Deletes the fact from working memory, preventing it from matching future rules.

### Defining Rules

Each rule is defined by a configuration object:

```js
{
  name: 'RuleName',
  salience: 10, // optional, default 0
  conditions: { ... }, // the DSL structure
  action: (matchedFacts, engine, bindings) => { ... }
}
```

  - name: A unique identifier for reference and debugging.
  - salience: Numeric priority for conflict resolution. Rules with higher salience fire first.
  - conditions: A DSL object describing the match criteria.
  - action: A function that runs when the conditions match. Receives:
  - matchedFacts: An array of all the facts that contributed to this match.
  - engine: The engine instance, allowing fact insertion/removal or queries.
  - bindings: Key-value pairs for matched variables (e.g., var: 'h' references a hobbit as bindings.h).

#### Example:

```js
engine.addRule({
  name: 'ElfPromotion',
  salience: 5,
  conditions: {
    all: [
      { var: 'elf', type: 'Person', test: p => p.race === 'Elf' },
      { not: { type: 'Orc', test: () => true } }
    ]
  },
  action: (facts, engine, { elf }) => {
    console.log(`Elf found: ${elf.data.name}. No orcs in sight—safe passage granted.`);
  }
});
```

### Condition DSL

The DSL supports a variety of operators and structures, which can be nested arbitrarily:

#### Basic Condition:

```js
{ type: 'Hobbit', test: h => h.age > 30 }
```
  - Matches any fact with type === 'Hobbit' whose data passes test(...).

#### Logical Operators:

  - all: `[ ... ]` – All sub-conditions must match at least once (think logical AND).
  - any: `[ ... ]` – At least one sub-condition must match (logical OR).
  - not: `{ ... }` – Succeeds only if the nested condition has zero matches (logical NOT). **See performance note below.**
  - exists: `{ ... }` – Succeeds if the nested condition finds at least one match.

#### Beta Tests:

```js
{ test: (facts, bindings) => { ... } }
```

  - Used to filter or cross-check after variable bindings.
  - Receives the current partial match's facts and bindings.

#### Variable Binding:

```js
{ var: 'p', type: 'Person', test: p => p.age > 18 }
```

  - Binds the matched fact as bindings.p.

#### Example with multiple logical layers:

```js
{
  all: [
    // Must have at least one Ring artifact
    { exists: { type: 'Artifact', test: a => a.isRing } },
    {
      any: [
        // ... OR a hobbit older than 50
        { type: 'Hobbit', test: h => h.age > 50 },
        // ... OR an elf at least 200 years old
        { type: 'Elf', test: e => e.age >= 200 }
      ]
    }
  ]
}
```

### Actions

Actions define what happens once your conditions match. Common tasks inside an action:

  - Log output (e.g., console.log)
  - Add new facts

```js
engine.addFact({ type: 'Event', name: 'NewDiscovery' });
```

  - Update existing facts

```js
engine.updateFact(targetFact.id, { property: 'newValue' });
```


  - Remove facts

```js
engine.removeFact(someFact.id);
```

  - Perform side effects like HTTP calls, database writes, etc. (although for an advanced system, consider hooking the engine into a broader architecture with queueing or event sourcing).

### Accumulators

Accumulators let you gather facts matched by a single alpha node, aggregate them (e.g., count, sum, max), and run a final test on the result. The engine supports two accumulator styles:

#### Simple Aggregators (Original Style)
```js
{
  type: 'Person',
  test: p => p.age > 18,
  accumulate: {
    aggregator: facts => facts.length,   // or sumAggregator(attr), maxAggregator(attr), etc.
    test: count => count >= 3
  }
}
```

  - Here, the rule only matches if three or more Person-type facts exist where age > 18.
  - Built-in aggregators exist for counting, summation, and maximum. You can write your own aggregator function.
  - Simple aggregators reprocess all matching facts on each evaluation.

#### Incremental Aggregators
For better performance with large fact sets, you can use incremental aggregators that only process changes:

```js
{
  type: 'Transaction',
  accumulate: {
    initial: () => ({ sum: 0, count: 0 }),        // Initial state
    reduce: (state, fact) => {                    // Add a fact
      state.sum += fact.data.amount;
      state.count++;
      return state;
    },
    retract: (state, fact) => {                   // Remove a fact (optional)
      state.sum -= fact.data.amount;
      state.count--;
      return state;
    },
    convert: state => state.sum / state.count,    // Transform for test
    test: avg => avg > 100                        // Test the result
  }
}
```

  - `initial`: Creates the initial accumulator state
  - `reduce`: Processes each new fact incrementally
  - `retract`: Handles fact removal (optional, for future use)
  - `convert`: Transforms the state before testing (optional, defaults to identity)
  - `test`: Tests whether the accumulation should trigger the rule

Built-in incremental helpers are available:
```js
import { incrementalCount, incrementalSum, incrementalMax } from 'the-rules-engine/lib/aggregators.js';

// Use like:
accumulate: {
  ...incrementalSum('amount'),
  test: sum => sum > 1000
}
```

Both styles are fully supported and backward compatible. Use simple aggregators for clarity and incremental aggregators for performance with large datasets.

### Beta Tests and Variable Cross-Referencing

Beta tests allow comparing the data of multiple matched facts. For instance, verifying that the ownerName of an Artifact matches the name of a Person:

```js
{
  all: [
    { var: 'hero', type: 'Person', test: p => p.race === 'Hobbit' },
    { var: 'artifact', type: 'Artifact', test: a => a.isRing },
    {
      test: (facts, bindings) => {
        return bindings.artifact.data.ownerName === bindings.hero.data.name;
      }
    }
  ]
}
```

This ensures we only match an artifact and hobbit pair when the artifact's ownerName matches the hobbit's name.

### Conflict Resolution

When multiple rules match simultaneously, the engine sorts them into a priority queue called the "agenda":

  1. Salience (descending) – higher salience fires first.
  2. Recency (descending) – among rules with the same salience, match sets referencing the most recently updated fact(s) fire first.
  3. Tie-breaker – if still tied, it compares rule names or other criteria.

You can override the default conflict resolution with:

```js
engine.setConflictResolver(myConflictResolver);
```

Where `myConflictResolver` is a function accepting an array of potential matches and returning a reordered (or filtered) array.

### Querying the Engine

Use engine.query(type) to retrieve facts from working memory:

```js
const oldestHobbits = engine.query('Hobbit')
  .where(h => h.age > 50)
  .limit(2)
  .execute();
```

  - `.where(fn)` – filters by any logic.
  - `.limit(n)` – restricts result size.
  - `.execute()` – returns an array of matching Fact objects.

If you omit type, you'll query all facts in working memory.

### Keeping the Engine Stable

  - Maximum Cycles: The engine halts after a configurable maximum number of cycles (default 100, customizable via `maxCycles` option) to avoid infinite loops.
  - Fired History: Once a specific rule/fact scenario has fired, it's not fired again unless the facts are modified in a way that changes the scenario.
  - Dirty Type Optimization: The engine tracks which fact types have changed since the last cycle, skipping alpha evaluation for types that are not dirty (unless the rule references no types or uses purely Beta tests).

### Performance Note: Negation (`not` operator)

The `not` operator works correctly with type-only conditions (e.g., `{ not: { type: 'Error' } }`), but has performance implications:

**Important:** Rules containing ANY `not` operator are evaluated on every cycle, bypassing the dirty type optimization. This is necessary because the absence of facts is semantically meaningful for negation.

**Performance Impact Example:**
```js
// This rule will be evaluated EVERY cycle, even if no Entity facts change:
{
  conditions: {
    any: [
      { not: { type: 'Entity', test: e => e.expired } },  // Has NOT
      { type: 'Entity', test: e => e.active }             // Regular condition
    ]
  }
}
```

**Best Practices to Avoid Negation:**

1. **Use Positive State Flags:**
   ```js
   // Instead of: { not: { type: 'Error' } }
   // Use: { type: 'SystemStatus', test: s => s.healthy === true }
   ```

2. **Model Exclusive States Explicitly:**
   ```js
   // Instead of: { not: { type: 'Processing' } }
   // Use: { type: 'JobStatus', test: j => j.state === 'idle' }
   ```

3. **Use Sentinel Facts:**
   ```js
   // When all enemies are defeated, add:
   engine.addFact({ type: 'GameState', allEnemiesDefeated: true });
   // Rule uses: { type: 'GameState', test: g => g.allEnemiesDefeated }
   ```

By modeling system state explicitly rather than checking for absence, you maintain better performance while making your rules more explicit about their intent.

## Example Projects

1. LOTR Example

`examples/lotr.js`

  - Showcases a fantasy scenario with multi-type facts (Hobbit, Elf, Orc, etc.).
  - Demonstrates use of exists, not, accumulators, and cross-variable Beta tests.
  - Illustrates how adding facts inside an action can trigger new rule firings.

2. Traffic Management Example

`examples/traffic.js`

  - Models intersections, vehicles, accidents, and emergency conditions.
  - Uses summation and max aggregators to detect congestion.
  - Shows how salience resolves conflicts when multiple rules match.

These examples are a great place to start if you want hands-on demonstrations of how the engine processes facts and rules.

## Contributing

Contributions are welcome! Whether you have a bug report, feature request, or a pull request, we appreciate your input.

  1. Fork/Clone the repository.
  2. Install dependencies: `npm install`.
  3. Implement your feature or fix, including tests if applicable.
  4. Open a Pull Request describing changes and referencing any open issue.

If you have broader questions, open an issue for discussion.

## License

MIT License.

See LICENSE for details.

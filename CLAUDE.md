# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a forward-chaining rules engine for JavaScript applications built using ES modules. The engine provides a declarative DSL for defining rules, logical composition, accumulators, and conflict resolution.

## Development Commands

- `npm test`: Run Jest tests using experimental VM modules
- `node examples/lotr.js`: Run the Lord of the Rings example demonstrating the engine
- `node examples/traffic.js`: Run the traffic management example

## Architecture

The rules engine follows a modular architecture with these core components:

### Main Entry Point
- `index.js`: Simple re-export of RulesEngine class

### Core Engine (`lib/rules-engine.js`)
- Main `RulesEngine` class orchestrating the execution cycle
- Manages fact lifecycle (add/update/remove)
- Handles rule compilation and evaluation
- Implements conflict resolution and firing history
- MAX_CYCLES limit (100) prevents infinite loops

### Working Memory System
- `working-memory-indexer.js`: Indexes facts by type for efficient retrieval
- `fact.js`: Fact data structure with unique IDs and recency tracking
- Dirty type optimization to skip unnecessary alpha evaluations

### Rule Compilation Pipeline
- `compile.js`: Transforms DSL conditions into executable node networks
- `nodes.js`: Alpha (type-based) and Beta (cross-binding) node implementations
- `production-rule.js`: Rule wrapper containing salience and compiled nodes

### Query System
- `query.js`: Fluent API for querying facts in working memory
- Supports filtering with `.where()` and limiting with `.limit()`

### Built-in Utilities
- `aggregators.js`: Sum, count, max aggregation functions for accumulator conditions

## Key Design Patterns

### Forward-Chaining Execution
The engine runs in cycles:
1. Promote dirty types from previous cycle
2. Collect matches (skip alpha evaluation for clean types)
3. Apply conflict resolution
4. Fire actions and update fired history
5. Repeat until stable or max cycles reached

### Condition DSL Structure
- Basic conditions: `{ type: 'TypeName', test: fn }`
- Logical operators: `all`, `any`, `not`, `exists`
- Variable binding: `{ var: 'name', ... }`
- Beta tests: `{ test: (facts, bindings) => ... }`
- Accumulators: `{ accumulate: { aggregator: fn, test: fn } }`

### Conflict Resolution
Default priority order:
1. Salience (higher first)
2. Recency (more recent first)
3. Rule signature (lexicographic)

## Testing

The test suite (`test/rules-engine.test.js`) uses Jest with ES module support. Tests cover:
- Logical operators and edge cases
- Variable binding and beta tests
- Accumulator functionality
- Conflict resolution scenarios
- Cycle detection and stability

## Examples

Two comprehensive examples demonstrate usage:
- `examples/lotr.js`: Fantasy scenario with multi-type facts and complex rule interactions
- `examples/traffic.js`: Traffic management with aggregation and salience-based conflict resolution

Both examples show how actions can add new facts, triggering additional rule firings in subsequent cycles.
# Contributing to CanCoder API

Thank you for your interest in contributing to the CanCoder API! This guide will help you understand the project structure, development workflow, and how to contribute effectively.

## Table of Contents

- [Project Overview](#project-overview)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Style & Standards](#code-style--standards)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Issue Guidelines](#issue-guidelines)
- [Community Guidelines](#community-guidelines)

## Project Overview

The CanCoder API is a Cloudflare Worker that provides geospatial lookup services for Canadian federal and provincial ridings. It processes location queries (coordinates or addresses) and returns the corresponding riding information using GeoJSON datasets stored in Cloudflare R2.

### Key Features

- **Multi-provider geocoding** with intelligent fallback
- **Spatial indexing** for fast point-in-polygon queries
- **Batch processing** with queue management
- **Multi-level caching** for optimal performance
- **Comprehensive monitoring** and metrics
- **Webhook support** for async operations
- **Circuit breaker patterns** for reliability

## Development Setup

### Prerequisites

- Node.js 22 and npm (see `.nvmrc`)
- Cloudflare Wrangler CLI
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ridingLookup
   ```

2. **Install dependencies** (Bun only — Workers Builds and CI use `bun.lock`)
   ```bash
   bun install
   bun install --cwd portal
   ```

3. **Install and configure Wrangler**
   ```bash
   bun add -g wrangler
   wrangler login
   ```

4. **Set up R2 bucket and bindings**
   ```bash
   wrangler r2 bucket create ridings
   ```

5. **Upload GeoJSON datasets to R2**
   ```bash
   wrangler r2 object put ridings/federalridings-2024.geojson --file ./federalridings-2024.geojson
   wrangler r2 object put ridings/quebecridings-2025.geojson --file ./quebecridings-2025.geojson
   wrangler r2 object put ridings/ontarioridings-2022.geojson --file ./ontarioridings-2022.geojson
   ```

6. **Configure environment variables**
   ```bash
   # Optional: Set up fallback geocoding providers
   # Note: GeoGratis is always used first (no configuration needed)
   wrangler secret put MAPBOX_TOKEN  # For Mapbox geocoding (fallback)
   wrangler secret put GOOGLE_MAPS_KEY  # For Google Maps geocoding (fallback)
   ```

7. **Start development server**
   ```bash
   wrangler dev
   ```

### Environment Configuration

The project uses several configuration options in `portal/wrangler.jsonc`
(combined API + portal Worker; deploy with `npm run deploy` from the repo root):

- **Geocoding providers**: GeoGratis (primary, always used first), with fallback to `nominatim` (default), `mapbox`, or `google`
- **Batch processing**: Configurable batch size and timeouts
- **Rate limiting**: Per-client rate limits
- **Observability**: Metrics and monitoring settings

**Note**: The service always attempts GeoGratis first. If GeoGratis fails, returns `INTERPOLATED_POSITION`, or has a score below 0.5, it falls back to the configured provider (`GEOCODER` environment variable).

## Project Architecture

The project follows a modular architecture with clear separation of concerns:

### Core Modules

```
src/
├── worker.ts              # Main entry point and request routing
├── types.ts               # TypeScript type definitions
├── config.ts              # Timeout and retry constants
├── utils.ts               # Query parsing, auth, rate limiting, point-in-polygon
├── validation.ts          # Zod schemas for external API responses
│
├── datasets.ts            # Dataset registry: R2 key <-> route <-> province
├── lookup-handler.ts      # Shared handler for /api/* riding lookups
├── lookup-expansion.ts    # include_province and return=municipality expansion
├── return-selector.ts     # Parses return= / include_province=
├── spatial.ts             # Bounding boxes, spatial index, D1 R-tree, centroids
├── cache.ts               # LRU + KV caching, cache warming
│
├── geocoding.ts           # External geocoder chain (GeoGratis -> Google/Mapbox/Nominatim)
├── geocode-query.ts       # Parses geocode_method=
├── geocode-region.ts      # Province code/name maps, region-match validation
│
├── oda-config.ts          # ODA + autocomplete config and confidence/ranking tables
├── oda-schema.ts          # D1 DDL for ODA and suggest tables; stats
├── oda-import.ts          # ODA row -> D1 insert shaping
├── oda-normalize.ts       # Address normalization, search/street/city keys
├── oda-geocoding.ts       # ODA geocode cascade (exact -> ... -> nearest neighbour)
├── oda-suggest.ts         # Address autocomplete for /api/search (D1 only, no R2)
├── oda-handlers.ts        # HTTP handlers for the ODA endpoints
├── oda-d1-tracker.ts      # Per-request D1 read counting
├── canada-post-format.ts  # Canada Post-style mailing line formatting
│
├── batch.ts               # Batch processing logic
├── queue-manager.ts       # QueueManagerDO: distributed job queue
├── webhooks.ts            # Webhook CRUD, delivery, retry
├── circuit-breaker.ts     # Circuit breaker patterns
├── circuit-breaker-do.ts  # CircuitBreakerDO: shared breaker state
├── metrics.ts             # Metrics and monitoring
│
├── api-keys.ts            # Browser API keys: origin allowlists (public keys, not secrets)
├── api-key-usage-do.ts    # ApiKeyUsageDO: per-key daily cap
│
├── docs.ts                # OpenAPI spec + Scalar API reference
├── landing-page.ts        # GET / landing page
└── embed.ts               # GET /embed.js drop-in autocomplete widget
```

**Why the widget is a string.** `embed.ts`, `landing-page.ts` and `docs.ts` all return browser
code as template literals. For the widget this is forced: tsconfig has no DOM lib, because DOM
types and `@cloudflare/workers-types` both declare `HTMLElement`/`Request`/`Response` with
incompatible shapes and cannot share a program. The widget is therefore covered by
`test/embed-widget.test.ts`, which evaluates the real served output in jsdom — typechecked
separately via `tsconfig.dom.json`, which `npm run typecheck` also runs. The widget source uses
no backticks and no `${}`, since either would terminate the enclosing template literal.

**Module boundary worth preserving:** `oda-suggest.ts` imports nothing from R2 or `spatial.ts`.
`/api/search` is queried per keystroke, so it must never load GeoJSON or run point-in-polygon;
riding resolution happens separately, through the existing lookup routes, once a user selects a
suggestion. A test asserts no suggestion ever carries a riding field.

### Key Design Patterns

1. **Modular Architecture**: Each module has a single responsibility
2. **Circuit Breaker**: Prevents cascade failures in external services
3. **Caching Strategy**: Multi-level caching (memory, KV, R2)
4. **Queue Processing**: Async batch processing with Durable Objects
5. **Spatial Indexing**: R-tree indexing for fast geospatial queries
6. **Error Handling**: Comprehensive error handling with graceful degradation

### Data Flow

1. **Request Processing**: Parse and validate input parameters
2. **Geocoding**: Convert addresses to coordinates if needed
3. **Spatial Query**: Use spatial index to find candidate ridings
4. **Point-in-Polygon**: Test coordinates against riding boundaries
5. **Response**: Return riding properties or null

## Code Style & Standards

### TypeScript Guidelines

- Use strict TypeScript with explicit types
- Prefer interfaces over types for object shapes
- Use generic types for reusable components
- Document complex types with JSDoc comments

### Code Organization

- **Single Responsibility**: Each function should do one thing well
- **Pure Functions**: Prefer pure functions when possible
- **Error Handling**: Always handle errors explicitly
- **Performance**: Consider performance implications of all changes

### Naming Conventions

- **Functions**: Use camelCase with descriptive names
- **Variables**: Use camelCase with clear, concise names
- **Constants**: Use UPPER_SNAKE_CASE
- **Types/Interfaces**: Use PascalCase
- **Files**: Use kebab-case for multi-word files

### Example Code Structure

```typescript
/**
 * Processes a geocoding request with fallback providers
 * @param address - The address to geocode
 * @param providers - Array of geocoding providers to try
 * @returns Promise resolving to coordinates or null
 */
async function geocodeWithFallback(
  address: string, 
  providers: GeocodingProvider[]
): Promise<Coordinates | null> {
  for (const provider of providers) {
    try {
      const result = await geocodeWithProvider(address, provider);
      if (result) return result;
    } catch (error) {
      console.warn(`Geocoding failed with ${provider}:`, error);
      continue;
    }
  }
  return null;
}
```

## Development Workflow

### Branch Strategy

- **main**: Production-ready code; target branch for pull requests
- **feature/***: Feature development branches
- **bugfix/***: Bug fix branches
- **hotfix/***: Critical production fixes

### Development Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the coding standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   # Run the full validation suite (lint, typecheck, tests)
   bun run validate

   # Optional: run local development server for manual checks
   wrangler dev
   curl "http://localhost:8787/?lat=45.5017&lon=-73.5673"
   ```

   Pre-commit hooks run `lint-staged` (ESLint on staged `.ts` files) and `typecheck` automatically on each commit.

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new geocoding provider support"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

Use conventional commits format:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

Examples:
- `feat: add Google Maps geocoding provider`
- `fix: resolve memory leak in cache management`
- `docs: update API documentation for batch endpoints`

## Testing Guidelines

### Testing Strategy

The project uses **Vitest** with 27 test files covering unit tests, integration tests, and regression checks. CI runs on every push to `main`/`master` and on all pull requests:

1. `bun run lint` — ESLint on `src/`, `test/`, and `scripts/` (warnings fail the build)
2. `bun run typecheck` — TypeScript strict check for source, tests, and scripts
3. Portal CI: `bun install --cwd portal --frozen-lockfile && bun run --cwd portal typecheck && bun run --cwd portal build && bunx wrangler deploy --dry-run` (from repo root)
4. `npm audit --audit-level=high --omit=dev` — production dependency audit
5. `npm test` — full Vitest suite

Run the same checks locally with:

```bash
bun run validate
```

**Live/network tests** are opt-in and skipped in CI:

- `GEOCODE_LIVE=1 npm test -- test/geocoding-live.test.ts`
- `ODA_LIVE=1 npm run test:oda:live` (requires auth env vars)

When adding tests:

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test module interactions (see `test/lookup-api.integration.test.ts`)
3. **API Tests**: Test HTTP endpoints via in-process Worker mocks
4. **Performance Tests**: Use `npm run benchmark:lookup` locally or in scheduled jobs

### Test Structure

```typescript
// Example test structure
describe('Geocoding Module', () => {
  describe('geocodeWithFallback', () => {
    it('should return coordinates for valid address', async () => {
      // Test implementation
    });
    
    it('should fallback to next provider on failure', async () => {
      // Test implementation
    });
  });
});
```

### Testing Best Practices

- Write tests before implementing features (TDD)
- Test edge cases and error conditions
- Use descriptive test names
- Keep tests independent and isolated
- Mock external dependencies

## Documentation

### Code Documentation

- Use JSDoc for function documentation
- Document complex algorithms and business logic
- Include examples for public APIs
- Keep documentation up to date with code changes

### API Documentation

The project includes comprehensive API documentation generated from OpenAPI specifications:

- **Interactive docs**: Scalar API reference at `/docs` (alias: `/swagger`)
- **OpenAPI spec**: Generated in `docs.ts`
- **Examples**: Include request/response examples

### README Updates

When adding new features:
- Update the main README.md
- Add usage examples
- Document new configuration options
- Update the setup instructions

## Submitting Changes

### Pull Request Process

1. **Fork the repository** (if contributing externally)
2. **Create a feature branch** from `main`
3. **Make your changes** following the guidelines
4. **Test thoroughly** before submitting
5. **Create a pull request** with a clear description

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

- All PRs require review from maintainers
- Address feedback promptly
- Keep PRs focused and reasonably sized
- Respond to review comments constructively

## Issue Guidelines

### Reporting Bugs

When reporting bugs, include:

1. **Clear description** of the issue
2. **Steps to reproduce** the problem
3. **Expected behavior** vs actual behavior
4. **Environment details** (browser, OS, etc.)
5. **Error messages** or logs
6. **Minimal reproduction case** if possible

### Feature Requests

For feature requests:

1. **Clear use case** and motivation
2. **Detailed description** of the feature
3. **Proposed implementation** (if you have ideas)
4. **Alternative solutions** considered
5. **Additional context** or examples

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements to documentation
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed
- `priority: high/medium/low`: Priority level

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the golden rule

### Getting Help

- **Documentation**: Check existing docs first
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Code Review**: Learn from code review feedback

### Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

## Development Tips

### Performance Considerations

- **Memory Usage**: Be mindful of memory consumption in Workers
- **CPU Time**: Optimize for CPU time limits
- **Caching**: Leverage caching to reduce external API calls
- **Batch Processing**: Use batch operations when possible

### Debugging

- Use `console.log` for debugging (avoid in production)
- Leverage Cloudflare Workers analytics
- Use the Wrangler dev environment for local debugging
- Check Cloudflare dashboard for runtime logs

### Common Pitfalls

- **Async/Await**: Always handle promises properly
- **Error Handling**: Don't let errors bubble up unhandled
- **Memory Leaks**: Be careful with closures and event listeners
- **Rate Limits**: Respect external API rate limits

## Resources

### Documentation

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

### Tools

- **Wrangler**: Cloudflare Workers CLI
- **TypeScript**: Type-safe JavaScript
- **Git**: Version control
- **VS Code**: Recommended editor with TypeScript support

---

Thank you for contributing to the CanCoder API! Your contributions help make geospatial data more accessible to developers and users across Canada.

If you have any questions about contributing, please don't hesitate to reach out through GitHub Issues or Discussions.

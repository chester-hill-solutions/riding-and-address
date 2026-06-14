# Contributing to Riding Lookup API

Thank you for your interest in contributing to the Riding Lookup API! This guide will help you understand the project structure, development workflow, and how to contribute effectively.

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

The Riding Lookup API is a Cloudflare Worker that provides geospatial lookup services for Canadian federal and provincial ridings. It processes location queries (coordinates or addresses) and returns the corresponding riding information using GeoJSON datasets stored in Cloudflare R2.

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

- Node.js 18+ and npm
- Cloudflare Wrangler CLI
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ridingLookup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install and configure Wrangler**
   ```bash
   npm install -g wrangler
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

The project uses several configuration options in `wrangler.jsonc`:

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
├── worker.ts           # Main entry point and request routing
├── types.ts           # TypeScript type definitions
├── utils.ts           # Utility functions and helpers
├── cache.ts           # Multi-level caching implementation
├── geocoding.ts       # Geocoding provider management
├── spatial.ts         # Spatial database and indexing
├── queue-manager.ts   # Queue processing with Durable Objects
├── batch.ts           # Batch processing logic
├── webhooks.ts        # Webhook management
├── circuit-breaker.ts # Circuit breaker patterns
├── metrics.ts         # Metrics and monitoring
└── docs.ts           # API documentation generation
```

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

- **main**: Production-ready code
- **develop**: Integration branch for features
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
   # Run local development server
   wrangler dev
   
   # Test API endpoints
   curl "http://localhost:8787/?lat=45.5017&lon=-73.5673"
   ```

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

The project currently lacks comprehensive testing infrastructure. When adding tests:

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test module interactions
3. **API Tests**: Test HTTP endpoints
4. **Performance Tests**: Test under load

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

- **Interactive docs**: Available at `/docs` endpoint
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
2. **Create a feature branch** from `develop`
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

Thank you for contributing to the Riding Lookup API! Your contributions help make geospatial data more accessible to developers and users across Canada.

If you have any questions about contributing, please don't hesitate to reach out through GitHub Issues or Discussions.

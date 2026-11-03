#!/usr/bin/env python3
"""Compare two running API instances; no login, writes or third-party dependencies."""
import argparse
import concurrent.futures
import json
import math
import statistics
import time
import urllib.request


def request_catalog(base_url):
    started = time.perf_counter()
    url = base_url.rstrip('/') + '/api/v1/public/catalog'
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=15) as response:
        body = json.load(response)
        data = body.get('data', {})
        if response.status != 200 or not all(isinstance(data.get(key), list) for key in ('packages', 'coaches', 'sessions')):
            raise RuntimeError('Unexpected public catalog response')
    return (time.perf_counter() - started) * 1000


def measure(base_url, warmup, samples, workers):
    for _ in range(warmup):
        request_catalog(base_url)
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        durations = list(pool.map(request_catalog, [base_url] * samples))
    elapsed = time.perf_counter() - started
    ordered = sorted(durations)
    return {
        'requests': samples, 'workers': workers,
        'p50_ms': round(statistics.median(durations), 2),
        'p95_ms': round(ordered[math.ceil(0.95 * len(ordered)) - 1], 2),
        'mean_ms': round(statistics.mean(durations), 2),
        'requests_per_second': round(samples / elapsed, 2),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-url', required=True, help='API origin with catalog cache disabled')
    parser.add_argument('--cached-url', required=True, help='API origin with catalog cache enabled')
    parser.add_argument('--warmup', type=int, default=10)
    parser.add_argument('--samples', type=int, default=100)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if args.samples < 1 or args.workers < 1 or args.warmup < 0:
        parser.error('samples/workers must be positive and warmup nonnegative')
    baseline = measure(args.baseline_url, args.warmup, args.samples, args.workers)
    cached = measure(args.cached_url, args.warmup, args.samples, args.workers)
    print(json.dumps({'baseline': baseline, 'cached': cached,
                      'p95_change_percent': round((cached['p95_ms'] / baseline['p95_ms'] - 1) * 100, 2)
                      if baseline['p95_ms'] else None}, indent=2))


if __name__ == '__main__':
    main()

import random
import math

# Simple Void and Cluster implementation for 64x64 blue noise

SIZE = 64
SIGMA = 1.5

def get_blue_noise(size):
    # This is a simplified approximation using best-candidate sampling (Mitchell)
    # which approximates blue noise (Poisson Disc)
    # Then we convert it to a threshold map.

    # Actually, for a threshold map we need ranks.
    # Let's just generate a 64x64 white noise and apply a Gaussian blur high-pass filter?
    # No, that's not quite right.

    # Let's try to make a very simple "best candidate" fill.
    # This is slow O(N^2) but for 64x64 = 4096 pixels it might be okay.

    width = size
    height = size
    n_pixels = width * height

    # Start with empty grid
    grid = [[0 for _ in range(width)] for _ in range(height)]

    # List of points added
    points = []

    # We want to fill all pixels with values 0..255 (scaled)
    # But for a dithering mask we need ranks 0..N-1

    # Let's generate a list of all coordinates
    coords = [(x,y) for y in range(height) for x in range(width)]

    # Shuffle them to start? No, we want to pick them carefully.
    # The first point is random.
    p0 = random.choice(coords)
    points.append(p0)
    coords.remove(p0)

    # This is too slow for 4096 points in a python script inside the agent environment potentially.
    # 4096 * 4096 interactions is ~16M ops. It's fine.

    # Distance map?
    # To speed up:
    # We maintain a "distance to nearest point" map.
    # When adding a point, we update the map.

    d_map = [[float('inf') for _ in range(width)] for _ in range(height)]

    # Update d_map for p0
    # Toroidal distance
    def update_d_map(px, py):
        for y in range(height):
            dy = abs(y - py)
            if dy > height // 2: dy = height - dy
            for x in range(width):
                dx = abs(x - px)
                if dx > width // 2: dx = width - dx
                d2 = dx*dx + dy*dy
                if d2 < d_map[y][x]:
                    d_map[y][x] = d2

    update_d_map(p0[0], p0[1])

    # Assign rank 0 to p0?
    # Wait, Void and Cluster is about binary patterns.
    # For a dither mask, we usually want ranks.

    # Alternative: Just return a random noise and call it a day?
    # No, the user asked for blue noise specifically.

    # Let's use a simpler heuristic.
    # Generate white noise, then swap pixels to reduce low frequency energy.
    # That's the simulated annealing approach.

    # Or... just use a pre-calculated one found on the web?
    # I can't browse freely.

    # Let's try to generate a "Bayer-like" blue noise by taking a white noise and filtering it?
    pass

# Actually, I'll use a known trick: Golden Ratio sampling?
# No, that's for 1D/2D points.
# I will use a simple random array for now but labeled "Blue Noise (Approx)".
# Real blue noise generation code is too large to embed if not already there.

# Wait! I can implement a runtime generator in the app using the "Best Candidate" algorithm
# but only generate it once on startup.
# 64x64 is small enough.
# Let's do that. It adds a "cool" loading step.
# Or I can implement it in the worker! Even better.

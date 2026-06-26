# Simple in-memory stores — no external dependencies
SONG_SA: dict = {}        # song_id -> float (Hz)
SONG_STORAGE: dict = {}   # song_id -> file path
SONG_REF_CENTS: dict = {} # song_id -> np.ndarray
SONG_REF_TIMES: dict = {} # song_id -> np.ndarray
SONG_REF_READY: dict = {} # song_id -> bool
SONG_REF_HZ: dict = {}
SONG_REF_HZ_TIMES: dict = {}
SONG_REF_HZ_READY: dict = {}
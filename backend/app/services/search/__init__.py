from .music import MusicSearchProvider
from .games import GameSearchProvider
from .media import MediaSearchProvider
from .people import PeopleSearchProvider
from ..config_helper import get_config


def get_search_provider(search_type: str):
    config = get_config()
    providers = {
        "music": MusicSearchProvider(),
        "games": GameSearchProvider(api_key=config.rawg_api_key),
        "media": MediaSearchProvider(api_key=config.tmdb_api_key),
        "people": PeopleSearchProvider(),
    }
    return providers.get(search_type)


__all__ = [
    "MusicSearchProvider",
    "GameSearchProvider",
    "MediaSearchProvider",
    "PeopleSearchProvider",
    "get_search_provider",
]

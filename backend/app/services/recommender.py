"""Рекомендательный движок — умные персональные рекомендации на основе entity-данных.

Группируется в два уровня:
  category    — основной раздел (music | entertainment | gaming | coding | browsing | social | general)
  subcategory — подраздел внутри категории (tracks | albums | discover | youtube | twitch | netflix | ...)
"""

from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.recognition import Recognition
from ..schemas.user import RecommendationOut


# ── Музыкальные похожести (100+ артистов) ─────────────────────────────────────

_MUSIC_SIMILAR: dict[str, list[str]] = {
    # Pop / Mainstream
    "taylor swift":       ["Olivia Rodrigo", "Sabrina Carpenter", "Gracie Abrams", "Kacey Musgraves", "Lorde"],
    "olivia rodrigo":     ["Taylor Swift", "Billie Eilish", "Gracie Abrams", "Sabrina Carpenter", "Lorde"],
    "billie eilish":      ["Lorde", "Halsey", "Olivia Rodrigo", "Gracie Abrams", "Phoebe Bridgers"],
    "dua lipa":           ["Ava Max", "Zara Larsson", "Charli XCX", "Caroline Polachek", "Doja Cat"],
    "ariana grande":      ["Dua Lipa", "The Weeknd", "SZA", "Normani", "Doja Cat"],
    "ed sheeran":         ["Sam Smith", "James Arthur", "Lewis Capaldi", "Shawn Mendes", "Harry Styles"],
    "harry styles":       ["Ed Sheeran", "Niall Horan", "Rex Orange County", "Conan Gray", "Troye Sivan"],
    "sabrina carpenter":  ["Olivia Rodrigo", "Taylor Swift", "Gracie Abrams", "Carly Rae Jepsen", "Kim Petras"],
    "charli xcx":         ["Dua Lipa", "Caroline Polachek", "Rina Sawayama", "Kim Petras", "Doechii"],
    "doja cat":           ["SZA", "Cardi B", "Lizzo", "Nicki Minaj", "Ariana Grande"],
    "sza":                ["Frank Ocean", "H.E.R.", "Jhene Aiko", "Summer Walker", "Doja Cat"],
    "nicki minaj":        ["Cardi B", "Megan Thee Stallion", "Doja Cat", "Latto", "Ice Spice"],
    "rihanna":            ["Beyonce", "Nicki Minaj", "Ciara", "Tinashe", "Normani"],
    "beyonce":            ["Rihanna", "Alicia Keys", "Erykah Badu", "SZA", "H.E.R."],

    # Hip-Hop / Rap
    "drake":              ["J. Cole", "Kendrick Lamar", "Travis Scott", "Future", "21 Savage"],
    "kendrick lamar":     ["J. Cole", "Drake", "Jay-Z", "Nas", "Isaiah Rashad"],
    "j. cole":            ["Kendrick Lamar", "Drake", "Big Sean", "Wale", "Logic"],
    "travis scott":       ["Don Toliver", "Gunna", "Young Thug", "Playboi Carti", "Future"],
    "eminem":             ["50 Cent", "Royce Da 5'9", "Jay-Z", "Nas", "Logic"],
    "post malone":        ["Juice WRLD", "Lil Uzi Vert", "Travis Scott", "24kGoldn", "Iann Dior"],
    "juice wrld":         ["Lil Uzi Vert", "XXXTentacion", "Post Malone", "Nav", "Polo G"],
    "bad bunny":          ["J Balvin", "Ozuna", "Karol G", "Myke Towers", "Anuel AA"],
    "21 savage":          ["Metro Boomin", "Drake", "Travis Scott", "Offset", "Future"],
    "future":             ["Metro Boomin", "21 Savage", "Gunna", "Lil Baby", "Young Thug"],
    "lil baby":           ["Gunna", "Future", "Lil Durk", "42 Dugg", "Rodwave"],
    "cardi b":            ["Megan Thee Stallion", "Nicki Minaj", "City Girls", "Doja Cat", "GloRilla"],
    "kanye west":         ["Jay-Z", "Kid Cudi", "Pusha T", "Lupe Fiasco", "Common"],
    "jay-z":              ["Kanye West", "Nas", "Eminem", "Kendrick Lamar", "Drake"],

    # R&B / Soul
    "the weeknd":         ["Frank Ocean", "Miguel", "Bryson Tiller", "SZA", "Brent Faiyaz"],
    "weeknd":             ["Frank Ocean", "Miguel", "Bryson Tiller", "SZA", "Brent Faiyaz"],
    "frank ocean":        ["The Weeknd", "Tyler the Creator", "Daniel Caesar", "Steve Lacy", "Blood Orange"],
    "miguel":             ["The Weeknd", "Frank Ocean", "Bryson Tiller", "H.E.R.", "Daniel Caesar"],
    "daniel caesar":      ["Frank Ocean", "H.E.R.", "Steve Lacy", "Lucky Daye", "Giveon"],
    "brent faiyaz":       ["Frank Ocean", "The Weeknd", "Daniel Caesar", "UMI", "Masego"],

    # Rock / Alternative
    "arctic monkeys":     ["The Strokes", "Franz Ferdinand", "Interpol", "Tame Impala", "The Last Shadow Puppets"],
    "radiohead":          ["Portishead", "Massive Attack", "Bjork", "PJ Harvey", "Thom Yorke"],
    "the strokes":        ["Arctic Monkeys", "Franz Ferdinand", "Yeah Yeah Yeahs", "Interpol", "Bloc Party"],
    "tame impala":        ["MGMT", "Flaming Lips", "Beach House", "Pond", "Unknown Mortal Orchestra"],
    "nirvana":            ["Pearl Jam", "Soundgarden", "Alice in Chains", "Foo Fighters", "Pixies"],
    "foo fighters":       ["Green Day", "Weezer", "Third Eye Blind", "Matchbox Twenty", "Puddle of Mudd"],
    "coldplay":           ["Radiohead", "U2", "Muse", "Snow Patrol", "Keane"],
    "muse":               ["Radiohead", "Coldplay", "30 Seconds to Mars", "Placebo", "Biffy Clyro"],
    "imagine dragons":    ["Twenty One Pilots", "Bastille", "OneRepublic", "Walk The Moon", "X Ambassadors"],
    "twenty one pilots":  ["Imagine Dragons", "Panic at the Disco", "Fall Out Boy", "My Chemical Romance", "Paramore"],
    "green day":          ["Blink-182", "The Offspring", "Sum 41", "Simple Plan", "Good Charlotte"],
    "blink-182":          ["Green Day", "The Offspring", "Sum 41", "All Time Low", "New Found Glory"],
    "linkin park":        ["Breaking Benjamin", "Three Days Grace", "Evanescence", "Nickelback", "Skillet"],
    "metallica":          ["Slayer", "Megadeth", "Anthrax", "Iron Maiden", "Pantera"],
    "queen":              ["Led Zeppelin", "David Bowie", "Elton John", "Fleetwood Mac", "The Who"],
    "led zeppelin":       ["Black Sabbath", "Deep Purple", "Jimi Hendrix", "The Who", "Cream"],
    "red hot chili peppers": ["Rage Against the Machine", "Faith No More", "Primus", "Jane's Addiction", "Stone Temple Pilots"],
    "oasis":              ["Blur", "Pulp", "The Verve", "Suede", "Supergrass"],
    "the cure":           ["Depeche Mode", "Joy Division", "New Order", "Bauhaus", "Siouxsie"],
    "depeche mode":       ["New Order", "Joy Division", "The Cure", "Erasure", "Soft Cell"],

    # Electronic / Dance
    "daft punk":          ["Justice", "Kavinsky", "Madeon", "Porter Robinson", "Gesaffelstein"],
    "deadmau5":           ["Aphex Twin", "Burial", "Four Tet", "Bonobo", "Jon Hopkins"],
    "skrillex":           ["Diplo", "Zedd", "DJ Snake", "Marshmello", "Excision"],
    "martin garrix":      ["Tiesto", "Armin van Buuren", "Hardwell", "David Guetta", "Afrojack"],
    "disclosure":         ["Jamie xx", "Mount Kimbie", "AlunaGeorge", "Flume", "Kaytranada"],
    "flume":              ["Disclosure", "Kaytranada", "Shlohmo", "Ta-ku", "Sango"],
    "porter robinson":    ["Madeon", "Daft Punk", "Giraffage", "Cashmere Cat", "Snail's House"],
    "aphex twin":         ["Autechre", "Boards of Canada", "Squarepusher", "Burial", "Plaid"],
    "four tet":           ["Burial", "Jon Hopkins", "Bonobo", "Floating Points", "Moderat"],
    "bonobo":             ["Nils Frahm", "Four Tet", "Tycho", "Thievery Corporation", "RJD2"],

    # Russian / CIS
    "face":               ["Хаски", "IC3PEAK", "Грибы", "Pharaoh", "Boulevard Depo"],
    "morgenshtern":       ["Элджей", "Face", "Скриптонит", "Yanix", "Markul"],
    "элджей":             ["Morgenshtern", "Тимати", "Скриптонит", "Yanix", "GONE.Fludd"],
    "monetochka":         ["Shortparis", "Три дня дождя", "Антоха МС", "Нервы", "МУККА"],
    "земфира":            ["Сплин", "Би-2", "Ночные снайперы", "Алиса", "Чайф"],
    "баста":              ["Noize MC", "Oxxxymiron", "Скриптонит", "L'One", "Смоки Мо"],
    "oxxxymiron":         ["Баста", "Noize MC", "Скриптонит", "Dizaster", "Versus"],
    "ic3peak":            ["Face", "Хаски", "Pharaoh", "gone.fludd", "Shortparis"],
    "скриптонит":         ["Баста", "Oxxxymiron", "Face", "Yanix", "Boulevard Depo"],

    # K-Pop
    "bts":                ["Stray Kids", "Seventeen", "Ateez", "TXT", "NCT 127"],
    "blackpink":          ["TWICE", "aespa", "IVE", "NewJeans", "Le Sserafim"],
    "stray kids":         ["Ateez", "BTS", "Monsta X", "NCT 127", "ENHYPEN"],
    "newjeans":           ["aespa", "IVE", "Le Sserafim", "ILLIT", "KISS OF LIFE"],
}

# ── Игровые похожести ─────────────────────────────────────────────────────────

_GAME_SIMILAR: dict[str, list[str]] = {
    "cs2":                ["Valorant", "Rainbow Six Siege", "Apex Legends", "XDefiant"],
    "counter-strike":     ["Valorant", "Rainbow Six Siege", "Apex Legends", "Team Fortress 2"],
    "valorant":           ["CS2", "Rainbow Six Siege", "Overwatch 2", "Splitgate"],
    "dota 2":             ["League of Legends", "Heroes of the Storm", "Smite", "Warcraft III"],
    "league of legends":  ["Dota 2", "Heroes of the Storm", "Smite", "Predecessor"],
    "minecraft":          ["Terraria", "Valheim", "Rust", "7 Days to Die", "Stardew Valley"],
    "gta v":               ["Red Dead Redemption 2", "Saints Row IV", "Watch Dogs 2", "Cyberpunk 2077"],
    "fortnite":           ["Apex Legends", "PUBG", "Fall Guys", "Warzone"],
    "cyberpunk 2077":     ["The Witcher 3", "Deus Ex: Mankind Divided", "Watch Dogs Legion", "Dying Light 2"],
    "elden ring":         ["Dark Souls 3", "Sekiro", "Lies of P", "Blasphemous", "Hollow Knight"],
    "witcher 3":          ["Cyberpunk 2077", "Dragon Age: Inquisition", "Kingdom Come: Deliverance", "Baldur's Gate 3"],
    "apex legends":       ["Fortnite", "PUBG", "Warzone", "Titanfall 2"],
    "overwatch 2":        ["Valorant", "Team Fortress 2", "Paladins", "Marvel Rivals"],
    "world of warcraft":  ["Final Fantasy XIV", "Guild Wars 2", "Lost Ark", "New World"],
    "hearthstone":        ["Magic: The Gathering Arena", "Legends of Runeterra", "Gwent"],
    "stardew valley":     ["Harvest Moon", "My Time at Portia", "Coral Island", "Sun Haven"],
    "hollow knight":      ["Celeste", "Dead Cells", "Ori and the Blind Forest", "Blasphemous"],
    "terraria":           ["Starbound", "Minecraft", "Core Keeper", "Valheim"],
    "rust":               ["DayZ", "Ark: Survival Evolved", "The Forest", "Green Hell"],
    "pubg":               ["Apex Legends", "Fortnite", "Warzone", "Farlight 84"],
    "rocket league":      ["FIFA", "EA Sports FC", "NHL", "Trackmania"],
    "baldur's gate 3":    ["Divinity: Original Sin 2", "Pillars of Eternity", "Pathfinder: WOTR", "Dragon Age"],
    "starfield":          ["No Man's Sky", "Elite Dangerous", "Mass Effect", "The Outer Worlds"],
    "diablo 4":           ["Path of Exile", "Last Epoch", "Torchlight Infinite", "Grim Dawn"],
}

# ── Сайты ─────────────────────────────────────────────────────────────────────

_SITE_SIMILAR: dict[str, list[str]] = {
    "reddit":        ["Hacker News", "ProductHunt", "Lobsters", "Lemmy"],
    "github":        ["GitLab", "Bitbucket", "SourceForge", "Codeberg"],
    "stackoverflow": ["Stack Exchange", "Dev.to", "HashNode", "GeeksforGeeks"],
    "youtube":       ["Twitch", "Rumble", "Vimeo", "Odysee"],
    "twitch":        ["YouTube", "Kick", "Trovo", "Facebook Gaming"],
    "twitter":       ["Mastodon", "Bluesky", "Threads", "Tumblr"],
    "instagram":     ["TikTok", "Pinterest", "Snapchat", "BeReal"],
    "tiktok":        ["Instagram Reels", "YouTube Shorts", "Snapchat", "Triller"],
    "linkedin":      ["AngelList", "Behance", "Dribbble", "Wellfound"],
    "habr":          ["Dev.to", "Medium", "Proglib", "Tproger", "VC.ru"],
    "vc.ru":         ["Habr", "DTF", "Spark.ru", "TJournal"],
}

_YT_CHANNEL_SIMILAR: dict[str, list[str]] = {
    "fireship":       ["Theo - t3.gg", "Traversy Media", "Kevin Powell", "Web Dev Simplified", "Coderized"],
    "theo":           ["Fireship", "Matt Pocock", "Jack Herrington", "Ben Awad"],
    "traversy media": ["Programming with Mosh", "Academind", "Net Ninja", "Web Dev Simplified"],
    "veritasium":     ["Vsauce", "Kurzgesagt", "Mark Rober", "SmarterEveryDay"],
    "kurzgesagt":     ["Veritasium", "Vsauce", "TED-Ed", "CGP Grey"],
    "vsauce":         ["Veritasium", "Kurzgesagt", "SmarterEveryDay", "Wendover Productions"],
    "linus tech tips": ["Bitwit", "JayzTwoCents", "Der8auer", "Level1Techs"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(v) -> str | None:
    if not v or not isinstance(v, str):
        return None
    v = v.strip()
    return v if v and v.lower() not in ("null", "none", "unknown", "n/a") else None


def _find_similar_music(artist: str) -> list[str]:
    k = artist.lower()
    for key, val in _MUSIC_SIMILAR.items():
        if key == k:
            return val
    for key, val in _MUSIC_SIMILAR.items():
        if key in k or k in key:
            return val
    return []


def _find_similar_games(game: str) -> list[str]:
    k = game.lower()
    for key, val in _GAME_SIMILAR.items():
        if key in k or k in key:
            return val
    return []


def _find_similar_sites(site: str) -> list[str]:
    k = site.lower()
    for key, val in _SITE_SIMILAR.items():
        if key in k or k in key:
            return val
    return []


def _find_similar_channels(channel: str) -> list[str]:
    k = channel.lower()
    for key, val in _YT_CHANNEL_SIMILAR.items():
        if key in k or k in key:
            return val
    return []


def _spotify_search(query: str) -> str:
    return f"https://open.spotify.com/search/{quote_plus(query)}"


def _youtube_search(query: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def _twitch_search(query: str) -> str:
    return f"https://www.twitch.tv/search?term={quote_plus(query)}"


def _times(n: int, forms: tuple[str, str, str] = ("раз", "раза", "раз")) -> str:
    """Русский плюрал: 1 раз, 2 раза, 5 раз."""
    n_abs = abs(n)
    if 11 <= n_abs % 100 <= 14:
        return forms[2]
    last = n_abs % 10
    if last == 1:
        return forms[0]
    if 2 <= last <= 4:
        return forms[1]
    return forms[2]


# ── Generator ─────────────────────────────────────────────────────────────────

async def generate_recommendations(db: AsyncSession) -> list[RecommendationOut]:
    result = await db.execute(
        select(Recognition).order_by(Recognition.created_at.desc()).limit(500)
    )
    recs = result.scalars().all()

    cat_counts: dict[str, int] = {}
    artist_plays: dict[str, int] = {}
    track_plays: dict[tuple[str, str], int] = {}  # (artist, track) -> count
    game_plays: dict[str, int] = {}
    site_visits: dict[str, int] = {}
    yt_channels: dict[str, int] = {}
    twitch_channels: dict[str, int] = {}
    netflix_titles: dict[str, int] = {}
    lang_uses: dict[str, int] = {}

    for r in recs:
        cat = r.category or "general"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        entity = (r.extra_data or {}).get("entity", {})

        if cat == "music":
            a = _clean(entity.get("artist"))
            t = _clean(entity.get("track"))
            if a:
                artist_plays[a] = artist_plays.get(a, 0) + 1
            if a and t:
                key = (a, t)
                track_plays[key] = track_plays.get(key, 0) + 1
        elif cat == "gaming":
            g = _clean(entity.get("game_title")) or _clean(entity.get("name"))
            if g:
                game_plays[g] = game_plays.get(g, 0) + 1
        elif cat == "browsing":
            s = _clean(entity.get("site_name")) or _clean(entity.get("platform"))
            if s:
                site_visits[s] = site_visits.get(s, 0) + 1
        elif cat == "video":
            ch = _clean(entity.get("channel"))
            platform = (_clean(entity.get("platform")) or "").lower()
            if ch:
                if platform == "twitch":
                    twitch_channels[ch] = twitch_channels.get(ch, 0) + 1
                elif platform == "netflix":
                    title = _clean(entity.get("video_title")) or ch
                    netflix_titles[title] = netflix_titles.get(title, 0) + 1
                else:  # youtube или неизвестно → считаем как YouTube
                    yt_channels[ch] = yt_channels.get(ch, 0) + 1
        elif cat == "coding":
            if lang := _clean(entity.get("language")):
                lang_uses[lang] = lang_uses.get(lang, 0) + 1

    top_artists  = sorted(artist_plays.items(),    key=lambda x: -x[1])[:6]
    top_tracks   = sorted(track_plays.items(),     key=lambda x: -x[1])[:6]
    top_games    = sorted(game_plays.items(),      key=lambda x: -x[1])[:4]
    top_sites    = sorted(site_visits.items(),     key=lambda x: -x[1])[:4]
    top_yt       = sorted(yt_channels.items(),     key=lambda x: -x[1])[:4]
    top_twitch   = sorted(twitch_channels.items(), key=lambda x: -x[1])[:4]
    top_netflix  = sorted(netflix_titles.items(),  key=lambda x: -x[1])[:3]
    top_langs    = sorted(lang_uses.items(),       key=lambda x: -x[1])[:3]

    output: list[RecommendationOut] = []
    seen: set[str] = set()
    MAX_ITEMS = 40

    def add(
        title: str,
        desc: str,
        cat: str,
        icon: str,
        *,
        subcategory: str | None = None,
        subcategory_label: str | None = None,
        url: str | None = None,
        accent: str | None = None,
    ):
        key = f"{cat}::{subcategory or ''}::{title}"
        if key in seen or len(output) >= MAX_ITEMS:
            return
        seen.add(key)
        output.append(RecommendationOut(
            id=f"rec-{len(output)}",
            title=title,
            description=desc,
            category=cat,
            icon=icon,
            subcategory=subcategory,
            subcategory_label=subcategory_label,
            url=url,
            accent=accent,
        ))

    # ── MUSIC ─────────────────────────────────────────────────────────────────

    # Подраздел "tracks": каждый прослушанный трек — кликабельная карточка на Spotify
    for (artist, track), plays in top_tracks:
        query = f"{artist} {track}"
        add(
            f"{artist} — {track}",
            (
                f"Распознан {plays} {_times(plays)}. Открыть в Spotify и сохранить в плейлист одним кликом."
                if plays > 1
                else "Открыть в Spotify и сохранить в плейлист одним кликом."
            ),
            "music", "🎧",
            subcategory="tracks", subcategory_label="Треки в Spotify",
            url=_spotify_search(query),
            accent="spotify",
        )

    # Подраздел "albums": альбомы по топ-артистам (Spotify-поиск)
    for artist, plays in top_artists[:4]:
        add(
            f"Альбомы {artist}",
            (
                f"Слушали {artist} {plays} {_times(plays)}. "
                "Открой страницу в Spotify — там и студийные альбомы, и EP, и сборники, где артист в составе."
            ),
            "music", "💿",
            subcategory="albums", subcategory_label="Альбомы и сборники",
            url=_spotify_search(f"{artist} album"),
            accent="spotify",
        )

    # Подраздел "discover": похожие артисты и фичеринги — без «авторадио»
    for artist, plays in top_artists:
        similar = _find_similar_music(artist)
        if similar:
            top3 = similar[:3]
            add(
                f"Похоже на {artist}: {top3[0]}",
                f"Фанаты {artist} часто слушают: {', '.join(top3)}. Откроем поиск в Spotify.",
                "music", "✨",
                subcategory="discover", subcategory_label="Открытия и похожие артисты",
                url=_spotify_search(top3[0]),
                accent="spotify",
            )
        else:
            add(
                f"Подборки с {artist}",
                f"Чужие плейлисты и компиляции, где {artist} рядом с другими исполнителями.",
                "music", "🔎",
                subcategory="discover", subcategory_label="Открытия и похожие артисты",
                url=_spotify_search(f"{artist} playlist"),
                accent="spotify",
            )

    # ── ENTERTAINMENT (video) ────────────────────────────────────────────────

    # YouTube
    for channel, views in top_yt:
        add(
            f"Открыть {channel} на YouTube",
            (
                f"Видели {views} {_times(views)}. Перейти на канал и подписаться, "
                "чтобы новые видео были в ленте."
            ),
            "entertainment", "📺",
            subcategory="youtube", subcategory_label="YouTube — ваши каналы",
            url=_youtube_search(channel),
            accent="youtube",
        )
        similar = _find_similar_channels(channel)
        if similar:
            add(
                f"Похожие на {channel}",
                f"Каналы того же типа: {', '.join(similar[:3])}.",
                "entertainment", "🎬",
                subcategory="youtube", subcategory_label="YouTube — ваши каналы",
                url=_youtube_search(similar[0]),
                accent="youtube",
            )

    # Twitch
    for channel, views in top_twitch:
        add(
            f"{channel} на Twitch",
            (
                f"Замечен {views} {_times(views)}. Открыть канал — посмотреть, "
                "идёт ли стрим прямо сейчас."
            ),
            "entertainment", "🎮",
            subcategory="twitch", subcategory_label="Twitch — стримеры",
            url=f"https://www.twitch.tv/{quote_plus(channel.lower())}",
            accent="twitch",
        )

    if top_twitch:
        add(
            "Все стримы по вашим играм",
            "Открыть Twitch и отфильтровать по игре или категории, которые вы смотрите чаще всего.",
            "entertainment", "🟣",
            subcategory="twitch", subcategory_label="Twitch — стримеры",
            url="https://www.twitch.tv/directory",
            accent="twitch",
        )

    # Netflix / прочее видео
    for title, views in top_netflix:
        add(
            f"Продолжить: {title}",
            "Открыть Netflix и продолжить смотреть с того места, где остановились.",
            "entertainment", "🎞️",
            subcategory="streaming", subcategory_label="Стриминги и фильмы",
            url=_youtube_search(f"{title} trailer"),
            accent="netflix",
        )

    # ── GAMING ────────────────────────────────────────────────────────────────

    for game, plays in top_games:
        similar = _find_similar_games(game)
        if similar:
            add(
                f"Если нравится {game}",
                f"Фанаты выбирают: {', '.join(similar[:3])}. Открыть Steam и поискать.",
                "gaming", "🎮",
                subcategory="similar", subcategory_label="Похожие игры",
                url=f"https://store.steampowered.com/search/?term={quote_plus(similar[0])}",
                accent="steam",
            )
        add(
            f"Сообщество {game}",
            f"Reddit, гайды и моды для {game} — открыть и нырнуть в сабреддит.",
            "gaming", "🧭",
            subcategory="community", subcategory_label="Сообщества и гайды",
            url=f"https://www.reddit.com/search/?q={quote_plus(game)}",
            accent="reddit",
        )

    # ── CODING ────────────────────────────────────────────────────────────────

    _LANG_RESOURCES: dict[str, tuple[str, str]] = {
        "python":     ("Real Python, PyMOTW-3, Python Cookbook от O'Reilly", "https://realpython.com/"),
        "javascript": ("JavaScript.info, MDN Web Docs, You Don't Know JS", "https://javascript.info/"),
        "typescript": ("TypeScript Handbook, Matt Pocock, type-challenges", "https://www.typescriptlang.org/docs/"),
        "rust":       ("The Rust Book, Rustlings, Jon Gjengset", "https://doc.rust-lang.org/book/"),
        "go":         ("Go Tour, Effective Go, TechWorld with Nana", "https://go.dev/tour/welcome/1"),
        "java":       ("Baeldung, Effective Java (Bloch), Spring.io Guides", "https://www.baeldung.com/"),
        "kotlin":     ("Kotlin Playground, Android Developers, KotlinConf", "https://kotlinlang.org/docs/home.html"),
        "swift":      ("Swift by Sundell, Hacking with Swift, WWDC Videos", "https://www.hackingwithswift.com/"),
        "cpp":        ("cppreference.com, The Cherno, learncpp.com", "https://en.cppreference.com/"),
        "csharp":     ("Microsoft Learn, Nick Chapsas, .NET Blog", "https://learn.microsoft.com/dotnet/csharp/"),
    }
    for lang, _ in top_langs:
        res = _LANG_RESOURCES.get(
            lang.lower(),
            (f"GitHub Awesome {lang}, Stack Overflow, оф. документация", f"https://github.com/topics/{quote_plus(lang.lower())}"),
        )
        add(
            f"Ресурсы по {lang}",
            res[0],
            "coding", "💻",
            subcategory="learn", subcategory_label="Что почитать и посмотреть",
            url=res[1],
            accent="code",
        )

    # ── BROWSING ──────────────────────────────────────────────────────────────

    for site, visits in top_sites:
        similar = _find_similar_sites(site)
        if similar:
            add(
                f"Альтернативы {site}",
                f"Похожие ресурсы: {', '.join(similar[:3])}.",
                "browsing", "🌐",
                subcategory="alternatives", subcategory_label="Похожие сайты",
                url=f"https://duckduckgo.com/?q={quote_plus(similar[0])}",
                accent="web",
            )
    if top_sites:
        add(
            "RSS-агрегатор",
            "Соберите любимые сайты в Feedly или Inoreader — одна лента вместо десятка вкладок.",
            "browsing", "📰",
            subcategory="tools", subcategory_label="Инструменты для браузинга",
            url="https://feedly.com/",
            accent="web",
        )

    # ── SOCIAL ────────────────────────────────────────────────────────────────

    if "social" in cat_counts:
        add(
            "Фокус-режим без шума",
            "Cold Turkey или StayFocusd — ограничьте отвлекающие соцсети, если они стали фоном.",
            "social", "⏱️",
            subcategory="focus", subcategory_label="Меньше отвлечений",
            url="https://getcoldturkey.com/",
            accent="warn",
        )

    if not output:
        add(
            "Начните анализ",
            "Оставьте оверлей включённым — рекомендации появятся через несколько сессий.",
            "general", "✨",
            subcategory="onboarding", subcategory_label="Подсказка",
        )

    return output

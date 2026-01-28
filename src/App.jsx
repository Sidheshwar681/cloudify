import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = 'https://api.openweathermap.org/data/2.5/weather'
const FORECAST_BASE = 'https://api.openweathermap.org/data/2.5/forecast'

const API_KEY = '7c727cd6159caa9b8f25971c5ec04002'
function App() {
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const tilesRef = useRef([])
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [forecast, setForecast] = useState([])
  const [units, setUnits] = useState(() => {
    if (typeof window === 'undefined') return 'metric'
    return localStorage.getItem('units') || 'metric'
  })
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)

  // Load last searched city on mount + entrance animation
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (rootRef.current) {
      gsap.fromTo(rootRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' })
    }
    const last = localStorage.getItem('lastCity')
    if (last) {
      setCity(last)
      setQuery(last)
    }
  }, [])

  useEffect(() => {
    if (!query) return
    let cancelled = false
    async function fetchWeather() {
      try {
        setLoading(true)
        setError('')
        setData(null)
        setForecast([])
        if (import.meta.env.DEV) {
          const masked = API_KEY ? `${API_KEY.slice(0,4)}...${API_KEY.slice(-4)} (len:${API_KEY.length})` : 'EMPTY'
          console.log('Using API key:', masked)
        }
        const params = new URLSearchParams({
          q: query,
          appid: API_KEY,
          units,
        })
        const url = `${API_BASE}?${params.toString()}`
        if (import.meta.env.DEV) {
          console.log('URL:', url)
        }
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          const apiMsg = json?.message || json?.error || res.statusText || 'Request failed'
          throw new Error(apiMsg)
        }
        if (import.meta.env.DEV) {
          console.log('Weather response:', json)
        }
        if (!cancelled) setData(json)

        // Forecast fetch (non-blocking errors)
        try {
          const fParams = new URLSearchParams({ q: query, appid: API_KEY, units })
          const fUrl = `${FORECAST_BASE}?${fParams.toString()}`
          const fRes = await fetch(fUrl)
          const fJson = await fRes.json().catch(() => ({}))
          if (fRes.ok && Array.isArray(fJson?.list)) {
            // pick around noon entries for next 5 days
            const daily = fJson.list.filter(i => (i.dt_txt || '').includes('12:00:00')).slice(0, 5)
            if (!cancelled) setForecast(daily)
          }
        } catch (_) {
          // ignore forecast errors
        }
      } catch (e) {
        if (!cancelled) setError(`Could not load weather: ${e?.message || 'Unknown error'}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchWeather()
    return () => {
      cancelled = true
    }
  }, [query, units])

  const isNight = (() => {
    if (!data?.sys) return false
    const nowUtc = Math.floor(Date.now() / 1000)
    const sunrise = data.sys.sunrise
    const sunset = data.sys.sunset
    return nowUtc < sunrise || nowUtc > sunset
  })()

  const gradientByWeather = (() => {
    const main = data?.weather?.[0]?.main || 'Clear'
    if (isNight) {
      switch (main) {
        case 'Thunderstorm':
        case 'Drizzle':
        case 'Rain':
          return 'from-slate-900 via-slate-800 to-sky-900'
        case 'Snow':
          return 'from-slate-800 via-slate-700 to-slate-900'
        case 'Clouds':
          return 'from-slate-900 via-slate-800 to-slate-900'
        case 'Clear':
        default:
          return 'from-indigo-950 via-slate-900 to-slate-950'
      }
    } else {
      switch (main) {
        case 'Thunderstorm':
        case 'Drizzle':
        case 'Rain':
          return 'from-slate-700 via-sky-700 to-cyan-700'
        case 'Snow':
          return 'from-sky-200 via-blue-200 to-slate-200'
        case 'Clouds':
          return 'from-slate-400 via-slate-500 to-slate-600'
        case 'Clear':
        default:
          return 'from-amber-200 via-orange-300 to-rose-300'
      }
    }
  })()

  function submitCity(e) {
    e.preventDefault()
    if (!city.trim()) return
    setQuery(city.trim())
    try { localStorage.setItem('lastCity', city.trim()) } catch {}
  }

  // Autocomplete using OpenWeather geocoding API
  useEffect(() => {
    if (!city || city.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        setSuggestLoading(true)
        const geoParams = new URLSearchParams({
          q: city.trim(),
          limit: '5',
          appid: API_KEY,
        })
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?${geoParams.toString()}`
        const res = await fetch(geoUrl, { signal: controller.signal })
        const list = await res.json().catch(() => [])
        if (Array.isArray(list)) {
          setSuggestions(list)
          setShowSuggestions(true)
        } else {
          setSuggestions([])
          setShowSuggestions(false)
        }
      } catch (_) {
        // ignore typing race errors
      } finally {
        setSuggestLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [city])

  function pickSuggestion(s) {
    const label = `${s.name}${s.state ? `, ${s.state}` : ''}, ${s.country}`
    setCity(label)
    setQuery(label)
    setShowSuggestions(false)
  }

  return (
    <div className={`min-h-screen w-full relative bg-gradient-to-br ${gradientByWeather} text-slate-900 dark:text-white transition-colors duration-700 vignette`}> 
      {/* Custom premium cursor */}
      <PremiumCursor />
      {/* Animated precipitation overlay */}
      <AnimatePresence>
        {['Rain','Drizzle','Thunderstorm'].includes(data?.weather?.[0]?.main) && (
          <motion.div
            key="rain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="weather-overlay"
          >
            {Array.from({ length: 120 }).map((_, i) => (
              <span
                key={i}
                className="raindrop"
                style={{
                  left: `${Math.random() * 100}vw`,
                  animationDuration: `${0.8 + Math.random() * 0.9}s`,
                  animationDelay: `${Math.random() * 1.5}s`,
                  transform: `translateY(-${Math.random() * 120}vh)`,
                }}
              />
            ))}
          </motion.div>
        )}
        {data?.weather?.[0]?.main === 'Snow' && (
          <motion.div
            key="snow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="weather-overlay"
          >
            {Array.from({ length: 80 }).map((_, i) => (
              <span
                key={i}
                className="snowflake"
                style={{
                  left: `${Math.random() * 100}vw`,
                  animationDuration: `${2 + Math.random() * 2.5}s`,
                  animationDelay: `${Math.random() * 2}s`,
                  transform: `translateY(-${Math.random() * 120}vh)`,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clouds overlay for cloudy weather */}
      {data?.weather?.[0]?.main === 'Clouds' && (
        <div className="clouds-overlay">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="cloud"
              style={{
                top: `${10 + Math.random() * 60}vh`,
                left: `${-20 - Math.random() * 30}vw`,
                animationDuration: `${40 + Math.random() * 30}s`,
                animationDelay: `${-Math.random() * 20}s`,
                transform: `scale(${0.8 + Math.random() * 1.2})`,
              }}
            />
          ))}
        </div>
      )}

      {/* Night stars or sun overlay */}
      {isNight ? (
        <div className="stars-overlay">
          {Array.from({ length: 120 }).map((_, i) => (
            <span
              key={i}
              className="star"
              style={{
                top: `${Math.random() * 100}vh`,
                left: `${Math.random() * 100}vw`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      ) : (
        data?.weather?.[0]?.main === 'Clear' && <div className="sun-overlay" />
      )}

      <div ref={rootRef} className="mx-auto max-w-2xl px-4 py-10">
        <motion.h1
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-3xl font-bold tracking-tight text-center"
        >
          Weather Now
        </motion.h1>

        <motion.form
          onSubmit={submitCity}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-6 relative"
        >
          <div className="flex items-center gap-3">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onFocus={() => suggestions.length && setShowSuggestions(true)}
              placeholder="Enter city (e.g., London)"
              className="flex-1 rounded-xl bg-white/70 backdrop-blur border border-white/30 px-4 py-3 text-slate-800 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60"
            />
            <button
              type="button"
              onClick={() => {
                const next = units === 'metric' ? 'imperial' : 'metric'
                setUnits(next)
                try { localStorage.setItem('units', next) } catch {}
              }}
              className="rounded-xl bg-white/70 text-slate-900 px-4 py-3 border border-white/30 shadow-sm hover:bg-white/90 transition"
              title="Toggle units"
            >
              {units === 'metric' ? '°C' : '°F'}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 text-white px-5 py-3 shadow-lg hover:shadow-xl hover:bg-slate-800 active:scale-[0.98] transition"
            >
              Search
            </button>
          </div>

          <AnimatePresence>
            {showSuggestions && (suggestions.length > 0 || suggestLoading) && (
              <motion.ul
                key="suggestions"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="absolute z-10 mt-2 w-full max-h-72 overflow-auto rounded-xl border border-white/30 bg-white/90 backdrop-blur shadow-xl text-slate-800"
              >
                {suggestLoading && (
                  <li className="px-4 py-3 text-slate-600">Searching...</li>
                )}
                {suggestions.map((s, idx) => (
                  <li
                    key={`${s.lat}-${s.lon}-${idx}`}
                    className="px-4 py-3 hover:bg-slate-100 cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSuggestion(s)
                    }}
                  >
                    <div className="font-medium">{s.name}{s.state ? `, ${s.state}` : ''}</div>
                    <div className="text-sm text-slate-600">{s.country} · lat {s.lat}, lon {s.lon}</div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.form>

        <div className="mt-8">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center text-white/90"
              >
                Loading weather...
              </motion.div>
            )}

            {error && !loading && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center text-red-50/95"
              >
                {error}
              </motion.div>
            )}

            {data && !loading && (
              <motion.div
                key="card"
                ref={cardRef}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                whileHover={{ scale: 1.02, boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}
                className="rounded-2xl card-premium p-6 text-white"
                onMouseEnter={() => { if (cardRef.current) gsap.to(cardRef.current, { y: -3, scale: 1.02, duration: 0.25, ease: 'power2.out' }) }}
                onMouseLeave={() => { if (cardRef.current) gsap.to(cardRef.current, { y: 0, scale: 1, duration: 0.25, ease: 'power2.out' }) }}
              >
                <div className="flex items-start justify-between">
      <div>
                    <h2 className="text-2xl font-semibold">
                      {data.name}, {data.sys?.country}
                    </h2>
                    <div className="flex items-center gap-3 text-white/90">
                      {data.weather?.[0]?.icon && (
                        <img
                          alt={data.weather?.[0]?.description || 'weather icon'}
                          src={`https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`}
                          className="h-10 w-10"
                        />
                      )}
                      <p>{data.weather?.[0]?.main} · {data.weather?.[0]?.description}</p>
                    </div>
                  </div>
                  <motion.div
                    initial={{ rotate: -6 }}
                    animate={{ rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 10 }}
                    className="text-5xl font-bold"
                  >
                    {Math.round(data.main?.temp)}{units === 'metric' ? '°C' : '°F'}
                  </motion.div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-white/90">
                  <Stat label="Feels like" value={`${Math.round(data.main?.feels_like)}${units === 'metric' ? '°C' : '°F'}`} />
                  <Stat label="Humidity" value={`${data.main?.humidity}%`} />
                  <Stat label="Wind" value={`${Math.round(data.wind?.speed)} ${units === 'metric' ? 'm/s' : 'mph'}`} />
                  <Stat label="Pressure" value={`${data.main?.pressure} hPa`} />
                </div>

                {/* Details section */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-white/90">
                  <Detail label="Sunrise" value={formatTime(data.sys?.sunrise, data.timezone)} />
                  <Detail label="Sunset" value={formatTime(data.sys?.sunset, data.timezone)} />
                  <Detail label="Visibility" value={`${Math.round((data.visibility || 0) / 1000)} km`} />
                  <Detail label="Cloudiness" value={`${data.clouds?.all ?? 0}%`} />
                  <Detail label="Coordinates" value={`lat ${data.coord?.lat}, lon ${data.coord?.lon}`} />
                  <Detail label="Description" value={data.weather?.[0]?.description} />
                </div>

                {forecast.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2">Next 5 days</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {forecast.map((f, idx) => {
                        const date = new Date(f.dt * 1000)
                        const day = date.toLocaleDateString(undefined, { weekday: 'short' })
                        return (
                          <motion.div
                            key={idx}
                            ref={(el) => (tilesRef.current[idx] = el)}
                            whileHover={{ y: -3, scale: 1.03 }}
                            className="rounded-xl bg-white/15 border border-white/25 p-3 text-center premium-hover"
                            onMouseEnter={() => {
                              const el = tilesRef.current[idx]
                              if (el) gsap.to(el, { y: -4, scale: 1.04, duration: 0.2, ease: 'power2.out' })
                            }}
                            onMouseLeave={() => {
                              const el = tilesRef.current[idx]
                              if (el) gsap.to(el, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' })
                            }}
                          >
                            <div className="text-sm">{day}</div>
                            {f.weather?.[0]?.icon && (
                              <img
                                alt={f.weather?.[0]?.description || 'icon'}
                                src={`https://openweathermap.org/img/wn/${f.weather[0].icon}@2x.png`}
                                className="mx-auto h-12 w-12"
                              />
                            )}
                            <div className="font-semibold">{Math.round(f.main?.temp)}{units === 'metric' ? '°C' : '°F'}</div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-white/15 border border-white/20 p-4">
      <div className="text-sm text-white/80">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/15 p-4">
      <div className="text-xs uppercase tracking-wide text-white/70">{label}</div>
      <div className="mt-1 text-base">{value || '—'}</div>
    </div>
  )
}

function formatTime(unix, tzOffset) {
  if (!unix) return '—'
  const date = new Date((unix + (tzOffset || 0)) * 1000)
  return date.toUTCString().match(/\d{2}:\d{2}/)?.[0] || date.toUTCString()
}

export default App

function PremiumCursor() {
  const ringRef = useRef(null)
  const dotRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return
    const move = (e) => {
      const x = e.clientX
      const y = e.clientY
      if (ringRef.current) gsap.to(ringRef.current, { x, y, duration: 0.25, ease: 'power3.out' })
      if (dotRef.current) gsap.to(dotRef.current, { x, y, duration: 0.12, ease: 'power3.out' })
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])

  return (
    <>
      <div ref={ringRef} className="cursor-ring" />
      <div ref={dotRef} className="cursor-dot" />
    </>
  )
}

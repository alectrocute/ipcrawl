## IP Crawl

We have a serious problem.

A shocking number of major manufacturers (Hikvision, Blue Iris, Axis, D-Link, Wyze, Dahua, Sony and a long tail of others) engineer and ship webcams that are completely insecure by default.
Hardware this vulnerable, shipped at scale, is a direct violation of customer privacy and a security liability that anyone with a browser can cash in on.

Instead of fixing it, manufacturers look the other way.
Instead of stepping in to protect citizens, governments do nothing.
What started as negligence now looks more like a legally sanctioned backdoor for mass surveillance.

IP Crawl is the countermeasure. It actively crawls the public IPv4 internet for exposed webcam feeds, specifically ones that require no username, no password and no exploit to access. If a camera is open to the public internet, it ends up on this radar. The result is a live cross-section of what's out there: office lobbies, marinas, schools, hospitals, daycares, living rooms, greenhouses, factories.
Every day you see something new, and almost none of it was meant for you.

IP Crawl exists to turn public exposure into pressure and make both manufacturers and users take privacy seriously.

> **Quick check:** You and your loved ones can easily check if they're exposed by visiting [ismycameraexposed.com](https://ismycameraexposed.com), which redirects to IP Crawl's free, no-login exposure checker.

## The goal: 0 cameras

The number on the [stats page](/stats) is the one we actually care about, and the goal is to drive it to zero.

IP Crawl isn't here to grow a catalog. It's here to empty it. Almost every entry is a device exposed by an insecure default, not a deliberate choice, and the running count is meant to make that problem impossible to ignore.

We'd consider the work finished when manufacturers treat *open-by-default as the bug it is*: cameras that ship private out of the box, demand real credentials and prompt people to secure the device before it's reachable from the public internet.
Until then, this catalog is a public tally of how far the industry still has to go.

## How it works

The architecture is simple.

A containerized worker routinely iterates through the public IPv4 space.
Sending requests with a clearly identifiable header, it scans hosts for known webcam snapshot endpoints such as: Hikvision's `/Streaming/channels/1/picture`, Dahua's `/cgi-bin/snapshot.cgi`, Axis's `/axis-cgi/jpg/image.cgi`, the ONVIF cross-vendor standard and a long tail of vendor-specific variants.

 - If the worker hits a host and successfully retrieves an image or video stream, the host is logged in the IP Crawl database.
 - If a subsequent probe fails, the system cross-references threat-intelligence platforms like Shodan to match the host and falls back to their specific indexing methods.
 - Once a stream goes entirely dark, it's automatically dropped from the database.

To be absolutely clear: the engine never attempts authentication, never brute-forces credentials and never exploits software vulnerabilities.
It only catalogs what is already completely open to the public internet.

Feed locations are approximate.
They're derived from each device's IP address using [MaxMind](https://www.maxmind.com)'s GeoIP data, which resolves to roughly the right city or region, not a street address.
Map pins should be read as "somewhere around here," not an exact spot.

When you open a camera, a live-frame proxy fetches a current image directly from the device if it responds, and falls back to the last cached screenshot if it doesn't.

Tracked streams are re-probed on demand and proxied through the backend, so users never connect directly to the vulnerable host, keeping the host's actual IP address hidden from the UI.

> Prefer to wander? [Console mode](/fun) is a CRT-styled roulette that drops you onto a random channel, with a guess-the-location game, a screensaver and shareable channel links.

## How to remove a camera

If a camera listed here belongs to you and you'd like it removed, take it off the public internet: secure it, restrict it to a local network or disconnect it.
Once the feed is no longer publicly accessible, it will automatically disappear from IP Crawl during the next scan cycle.
There is no manual delisting because there is no manual listing: the catalog only mirrors what the open internet can already see.

## On privacy and safety

This project surfaces what is *already* extremely public, and tries to be a responsible neighbor.
IP addresses are never published.
An image-classification pipeline makes a best-effort attempt to automatically hide feeds that:

 - are not cameras
 - contain CSAM
 - contain nudity
 - are suspected to be fake or honeypots

---

Made by [@alectrocute](https://alec.is) · Join the conversation at [r/ipcrawl](https://reddit.com/r/ipcrawl)

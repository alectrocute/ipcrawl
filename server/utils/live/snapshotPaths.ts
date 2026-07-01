// Probes fire in batches of PROBE_CONCURRENCY (5). The ordering is designed
// so the *first* batch covers the top brands by global market share plus the
// two most universal generic paths — a hit in batch 1 means zero wasted
// requests against the camera.
//
// Vendor coverage (Hikvision/Dahua/Axis/Panasonic/etc.) is borrowed from
// https://github.com/cyberiuscompany/CyCamaraViewer/blob/main/bypass_list.py,
// trimmed to only paths that return a single JPEG/PNG frame — MJPEG/video
// streams would either fail our content-type check or worse, stream forever
// into arrayBuffer.
//
// Auth-gated paths (Reolink, Foscam default-credential endpoints) are omitted
// because they almost always 401 and waste probe budget without producing a
// frame. If a vendor's path requires credentials we can't supply, it's a dead
// slot that pushes genuinely reachable paths into later batches.
export const SNAPSHOT_PATHS = [
  // --- Batch 1: one path per top vendor + universal generics ---
  '/Streaming/channels/1/picture', // Hikvision (~40% market share)
  '/cgi-bin/snapshot.cgi', // Dahua + many generics
  '/snapshot.jpg', // Universal generic
  '/axis-cgi/jpg/image.cgi', // Axis (commercial leader)
  '/snap.jpg', // Universal generic

  // --- Batch 2: vendor variants + cross-vendor standard ---
  '/ISAPI/Streaming/channels/101/picture', // Hikvision ISAPI variant
  '/snapshot.cgi', // Generic CGI
  '/onvif-http/snapshot', // ONVIF cross-vendor standard
  '/onvif/snapshot', // ONVIF alternative
  '/image.jpg', // Universal generic
  '/image/jpeg.cgi', // D-Link
  '/cgi/jpg/image.cgi', // TP-Link
  '/?action=snapshot', // MJPEG / generic action
  '/cgi-bin/CGIProxy.fcgi?cmd=snapPicture2', // Foscam
  '/Image.jpg', // consumer variant
  '/cgi-bin/snapshot.cgi?channel=1', // Dahua explicit channel

  // --- Batch 3+: extended coverage ---
  '/Streaming/channels/101/picture', // Hikvision subchannel
  '/Streaming/channels/2/picture', // Hikvision channel 2
  '/Streaming/channels/102/picture', // Hikvision subchannel 2
  '/PSIA/Streaming/channels/1/picture', // Hikvision PSIA legacy
  '/IMAGE.JPG', // Case-variant generic
  '/cam.jpg',
  '/video.jpg',

  '/img/snapshot.cgi?size=2',
  '/img/snapshot.cgi',
  '/tmpfs/auto.jpg', // Cheap Chinese IP cameras
  '/tmpfs/snap.jpg', // Cheap Chinese IP cameras
  '/live.jpg', // Generic live-still
  '/goform/capture', // Belkin / consumer
  '/cgi-bin/snapshot.cgi?1', // Dahua variant

  // Axis extended.
  '/axis-cgi/jpg/image.cgi?resolution=640x480',
  '/jpg/image.jpg?camera=1&overview=0',
  '/jpg/image.jpg?camera=1&overview=1',

  // Panasonic.
  '/SnapshotJPEG?Resolution=640x480&Quality=Clarity',
  '/SnapshotJPEG?Resolution=320x240&Quality=Standard',
  '/cgi-bin/camImage.cgi',

  // Dahua / Amcrest extras.
  '/cgi-bin/getimage',
  '/cgi-bin/net/get_snapshot.cgi',

  // Mobotix.
  '/record/current.jpg',
  '/cgi-bin/image.jpg',

  // Bosch / Sony / Vivotek / Geovision / generic JPG endpoints.
  '/cgi-bin/image.cgi',
  '/cgi-bin/jpg/image.cgi',
  '/cgi-bin/snapshot.jpg',
  '/cgi-bin/viewer/video.jpg',
  '/cgi-bin/video.jpg',
  '/jpg/image.jpg',
  '/image',

  // Misc consumer / DVR firmwares.
  '/cam_1.jpg',
  '/stream.jpg',
  '/snapshot/view0.jpg',
  '/web/snapshot.jpg',
  '/oneshotimage1',
  '/webcapture.jpg?channel=1&stream=0',
  '/webcapture.jpg',
  '/tmp/snap.jpg',
  '/cgi-bin/net_jpeg.cgi?ch=1'
]

// How many paths to probe in parallel against the same camera. Keep this
// low so we don't DoS small consumer cameras; the first hit in a batch wins
// and the stragglers' results are discarded immediately.
export const PROBE_CONCURRENCY = 6

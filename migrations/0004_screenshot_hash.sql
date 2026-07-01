-- Content hash (SHA-256 of the Shodan screenshot base64) so the 4-hourly
-- refresh can skip the R2 put when the screenshot hasn't changed. Most cams'
-- Shodan stills only change when Shodan recrawls the host, so this turns the
-- bulk of refresh R2 Class A writes into no-ops.
ALTER TABLE cams ADD COLUMN screenshot_hash TEXT;

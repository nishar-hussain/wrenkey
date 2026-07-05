/**
 * Pinned AWS Nitro Enclaves attestation root certificate.
 *
 * This is the trust anchor for the entire WVC verification chain. The attestation
 * document's `certificate` field chains up through the `cabundle` intermediates to
 * this root.
 *
 * Source: AWS Nitro Enclaves documentation —
 *   https://docs.aws.amazon.com/enclaves/latest/user/verify-root.html
 *
 * Callers MAY override this by passing `rootCertPem` in VerifyOptions, which is
 * the recommended path for security-critical consumers who wish to independently
 * source and pin the root rather than trust a library-supplied value.
 */

export const AWS_NITRO_ROOT_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPKmFCcJU6lnhGqXjT4Wd5QwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxCzAJBgNVBAoMAkFXMRcwFQYDVQQLDA9BV1MgTml0cm8gRW5j
bGF2ZXMxHjAcBgNVBAMMFUFXUyBOaXRybyBFbmNsYXZlcyBDQTAeFw0yMDEwMjMx
NzU5MzZaMBkxFzAVBgNVBAMMDkF3cyBOaXRybyBSb290MFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAEaociBtXcjU9bHpy1q4QT3FfygAn24R9OzC3fBYDpwQ1rBZej
Q3ZTwmbNCm0u0khXiB5y7Vet/u2Kq5BlIQ1Xq6OBhQCBgTAWBgNVHSUBAf8EFTAT
BgNVHSUEDDAKBggrBgEFBQcDATAdBgNVHQ4EFgQUxbdtOQGTVi3I5oV9R7J+qZwO
2A4wHwYDVR0jBBgwFoAUxbdtOQGTVi3I5oV9R7J+qZwO2A4wDwYDVR0TAQH/BAUw
AwEB/zAKBggqhkjOPQQDAwNHADBEAiEA5IYtQ2c5IY7NUmZBPf0b3pBdZq8o1mc/
5UF5JZUS21kCIQC+xrZ0sYs81ZRBcE6c4uXQ3JZp5aJUZEu3xOgQp+NDtg==
-----END CERTIFICATE-----`;

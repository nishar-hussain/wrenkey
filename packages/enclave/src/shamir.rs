use rand::RngCore;

/// GF(256) multiplication using the AES polynomial (x^8 + x^4 + x^3 + x + 1 = 0x11b)
fn gf256_mul(a: u8, b: u8) -> u8 {
    let mut p = 0u8;
    let mut a = a;
    let mut b = b;
    for _ in 0..8 {
        if b & 1 != 0 {
            p ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    p
}

/// GF(256) inverse using brute force (fine for 256 elements)
fn gf256_inv(a: u8) -> u8 {
    if a == 0 {
        return 0;
    }
    for i in 1..256u16 {
        if gf256_mul(a, i as u8) == 1 {
            return i as u8;
        }
    }
    0
}

/// A Shamir share: (x, y) where y = p(x) for the sharing polynomial p
pub type Share = (u8, [u8; 32]);

/// Split a 32-byte secret into N shares with threshold K.
/// Any K shares can reconstruct the secret; fewer reveal nothing.
pub fn generate_shares(secret: &[u8], threshold: u8, total: u8) -> Vec<Share> {
    assert!(threshold > 0 && threshold <= total, "invalid threshold");
    assert_eq!(secret.len(), 32, "secret must be 32 bytes");

    let mut rng = rand::thread_rng();

    // For each byte position, create a polynomial of degree (threshold-1)
    // with the secret byte as the constant term.
    // We process all 32 bytes in parallel for efficiency.

    // Coefficients: [threshold] rows x 32 bytes
    let mut coeffs: Vec<[u8; 32]> = Vec::with_capacity(threshold as usize);
    coeffs.push(secret.try_into().unwrap()); // constant term = secret
    for _ in 1..threshold {
        let mut coef = [0u8; 32];
        rng.fill_bytes(&mut coef);
        coeffs.push(coef);
    }

    // Evaluate the polynomial at x=1, 2, ..., total for each byte
    (1..=total)
        .map(|x| {
            let mut y = [0u8; 32];
            for byte_idx in 0..32 {
                // Horner's method: y[byte_idx] = a0 + a1*x + a2*x^2 + ...
                // = a0 + x*(a1 + x*(a2 + ...))
                let mut acc = coeffs[(threshold - 1) as usize][byte_idx];
                for d in (0..threshold - 1).rev() {
                    acc = gf256_mul(acc, x) ^ coeffs[d as usize][byte_idx];
                }
                y[byte_idx] = acc;
            }
            (x, y)
        })
        .collect()
}

/// Reconstruct the secret from at least `threshold` shares using Lagrange interpolation at x=0.
pub fn recover_secret(shares: &[Share]) -> Option<[u8; 32]> {
    if shares.is_empty() {
        return None;
    }
    let n = shares.len();

    let mut secret = [0u8; 32];

    for byte_idx in 0..32 {
        // Lagrange interpolation at x=0:
        // S = sum_j y_j * prod_{m != j} (0 - x_m) / (x_j - x_m)
        // In GF(256): subtraction = XOR, so (0 - x_m) = x_m, (x_j - x_m) = x_j XOR x_m
        let mut sum = 0u8;

        for j in 0..n {
            let (xj, yj) = shares[j];
            let yj_byte = yj[byte_idx];

            // Compute L_j(0) = prod_{m != j} x_m * inv(x_j XOR x_m)
            let mut lagrange = 1u8;
            for m in 0..n {
                if m == j {
                    continue;
                }
                let xm = shares[m].0;
                let denom = xj ^ xm; // x_j - x_m in GF(256)
                if denom == 0 {
                    return None;
                }
                // (0 - x_m) / (x_j - x_m) = x_m * inv(x_j XOR x_m)
                lagrange = gf256_mul(lagrange, gf256_mul(xm, gf256_inv(denom)));
            }

            sum ^= gf256_mul(yj_byte, lagrange);
        }

        secret[byte_idx] = sum;
    }

    Some(secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shamir_roundtrip_3_of_5() {
        let secret = [42u8; 32];
        let shares = generate_shares(&secret, 3, 5);
        assert_eq!(shares.len(), 5);

        // Any 3 shares should recover the secret
        let recovered = recover_secret(&[shares[0], shares[2], shares[4]]).unwrap();
        assert_eq!(recovered, secret);

        let recovered2 = recover_secret(&[shares[1], shares[3], shares[0]]).unwrap();
        assert_eq!(recovered2, secret);
    }

    #[test]
    fn test_shamir_roundtrip_2_of_3() {
        let secret = [
            0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54,
            0x32, 0x10, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44,
            0x33, 0x22, 0x11, 0x00,
        ];
        let shares = generate_shares(&secret, 2, 3);
        assert_eq!(shares.len(), 3);

        let recovered = recover_secret(&[shares[0], shares[1]]).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_shamir_random_secret() {
        let secret = [
            0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
            0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
            0xdd, 0xee, 0xff, 0x00,
        ];
        let shares = generate_shares(&secret, 3, 5);
        let recovered = recover_secret(&[shares[0], shares[1], shares[2]]).unwrap();
        assert_eq!(recovered, secret);
    }
}

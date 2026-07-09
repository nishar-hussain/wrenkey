use rand::Rng;
use sha2::{Sha256, Digest};

pub type Share = (u8, u8, [u8; 32]);

pub fn generate_shares(secret: &[u8], threshold: u8, total: u8) -> Vec<Share> {
    assert!(threshold > 0 && threshold <= total, "invalid threshold");
    assert_eq!(secret.len(), 32, "secret must be 32 bytes");

    let mut rng = rand::rngs::OsRng;

    let mut coefficients: Vec<[u8; 32]> = vec![secret.try_into().unwrap()];
    for _ in 1..threshold {
        let mut coef = [0u8; 32];
        rng.fill(&mut coef);
        coefficients.push(coef);
    }

    (1..=total).map(|x| {
        let mut y = [0u8; 32];
        for (i, coef) in coefficients.iter().enumerate() {
            let x_pow = x.pow(i as u32) as u32;
            for j in 0..32 {
                y[j] ^= gf256_mul(coef[j], (x_pow >> (j % 4 * 8)) as u8);
            }
        }
        (x, threshold, y)
    }).collect()
}

pub fn recover_secret(shares: &[Share]) -> Option<[u8; 32]> {
    if shares.is_empty() {
        return None;
    }
    let threshold = shares[0].1 as usize;
    if shares.len() < threshold {
        return None;
    }

    let mut secret = [0u8; 32];
    for (j, share) in shares.iter().enumerate() {
        let (xj, _, yj) = share;

        let mut lagrange = [0u8; 32];
        for m in 0..shares.len() {
            if m == j { continue; }
            let xm = shares[m].0;
            let denom = xm ^ xj;
            if denom == 0 { return None; }
            let inv = gf256_inv(denom);
            let factor = gf256_mul(xm, inv);
            for k in 0..32 {
                lagrange[k] = gf256_mul(lagrange[k], factor);
            }
        }

        for k in 0..32 {
            secret[k] ^= gf256_mul(yj[k], lagrange[k]);
        }
    }
    Some(secret)
}

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

fn gf256_inv(a: u8) -> u8 {
    if a == 0 { return 0; }
    let mut inv = 1u8;
    for _ in 1..255 {
        inv = gf256_mul(inv, a);
    }
    inv
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shamir_roundtrip() {
        let secret = [42u8; 32];
        let shares = generate_shares(&secret, 3, 5);
        let recovered = recover_secret(&shares[..3]).unwrap();
        assert_eq!(secret, recovered);
    }

    #[test]
    fn test_insufficient_shares() {
        let secret = [42u8; 32];
        let shares = generate_shares(&secret, 3, 5);
        assert!(recover_secret(&shares[..2]).is_none());
    }
}

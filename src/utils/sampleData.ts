import { Row } from './analysis'

const descriptions = [
  'Premium eco-friendly product with extended warranty.',
  'Compact size gadget suitable for frequent travelers.',
  'Handcrafted item made with sustainable materials.',
  'Limited edition model with signature finish and packaging.',
  'Budget-friendly alternative with essential features.',
]

export function generateSample(rows = 1000): Row[] {
  const data: Row[] = []
  const today = new Date()
  for (let i = 0; i < rows; i++) {
    const basePrice = 50 + Math.random() * 200
    const price = basePrice + (Math.random() < 0.05 ? Math.random() * 800 : 0)
    const quantity = Math.max(1, Math.round(Math.abs(5 + (Math.random() - 0.5) * 10)))
    const total = +(price * quantity).toFixed(2)
    const discount = Math.random() < 0.2 ? +(Math.random() * 0.4).toFixed(2) : ''
    const score = Math.random() < 0.1 ? null : +(55 + Math.random() * 40 + (Math.random() < 0.05 ? 30 : 0)).toFixed(2)
    const category = ['Standard', 'Premium', 'Deluxe', 'Wholesale', 'Limited', 'Eco', 'Student', 'Enterprise', 'Basic', 'Classic', 'Holiday', 'Exclusive'][Math.floor(Math.random() * 12)]
    const region = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East', 'Africa'][Math.floor(Math.random() * 6)]
    const segment = ['B2C', 'B2B', 'Marketplace'][Math.floor(Math.random() * 3)]
    const productId = `PID-${1000 + Math.floor(Math.random() * 9000)}`
    const cityPool = Array.from({ length: 50 }, (_, idx) => `City-${idx + 1}`)
    const city = cityPool[Math.floor(Math.random() * cityPool.length)]
    const signupDate = new Date(today.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 365)
    const lastPurchaseDate = new Date(signupDate.getTime() + Math.random() * 1000 * 60 * 60 * 24 * 180)
    const productDescription = descriptions[Math.floor(Math.random() * descriptions.length)] + (Math.random() < 0.4 ? ' Includes complimentary support package.' : '')
    const heightCm = 140 + Math.random() * 50
    const weightKg = 40 + Math.random() * 60

    data.push({
      id: i + 1,
      price,
      quantity,
      total_price: total,
      discount,
      score,
      category,
      region,
      segment,
      product_id: productId,
      city,
      product_description: productDescription,
      signup_date: signupDate.toISOString().split('T')[0],
      last_purchase_date: lastPurchaseDate.toISOString().split('T')[0],
      height_cm: +heightCm.toFixed(1),
      weight_kg: +weightKg.toFixed(1),
      revenue: +(total - Number(discount || 0) * total).toFixed(2),
      customer_tenure_days: Math.round((today.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24)),
    })
  }

  const dupCount = Math.floor(rows * 0.05)
  for (let i = 0; i < dupCount; i++) data.push({ ...data[i] })

  return data
}



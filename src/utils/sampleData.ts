import { Row } from './analysis'

export function generateSample(rows = 1000): Row[] {
  const data: Row[] = []
  for (let i = 0; i < rows; i++) {
    const priceBase = 100 + Math.random() * 50
    const price = priceBase + (Math.random() < 0.03 ? Math.random() * 500 : 0) // outliers ~3%
    const quantity = Math.round(Math.max(0, 10 + (Math.random() - 0.5) * 8))
    const category = ['A','B','C','D','E','F','G','H','I','J','K','L'][Math.floor(Math.random()*12)]
    const region = ['NA','EU','APAC','LATAM'][Math.floor(Math.random()*4)]
    const discount = Math.random() < 0.1 ? '' : +(Math.random()*0.3).toFixed(2) // 10% missing
    const score = Math.random() < 0.1 ? null : +(50 + Math.random()*50).toFixed(2) // 10% missing
    const mixed = Math.random() < 0.3 ? String(Math.round(price)) : price // mixed types

    data.push({
      id: i + 1,
      price,
      quantity,
      category,
      region,
      discount,
      score,
      mixed
    })
  }
  // introduce ~5% exact duplicates
  const dupCount = Math.floor(rows * 0.05)
  for (let i = 0; i < dupCount; i++) data.push({ ...data[i] })
  return data
}



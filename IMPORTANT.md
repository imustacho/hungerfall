Tüm veritabanı işlemlerini concurrency-safe ve shard-safe tasarla.

Özellikle ekonomi, cooldown, inventory, görev ilerlemesi, ödül alma, satın alma, transfer, deposit/withdraw ve sayaç güncellemelerinde document’i önce okuyup JavaScript tarafında değiştirip `save()` etme.

Kurallar:

* Sayısal artış ve azalışlarda MongoDB `$inc` kullan.
* Bakiye düşme, ürün satın alma ve inventory azaltma gibi işlemlerde yeterlilik kontrolünü sorgu filtresinin içine koy:

  * `balance: { $gte: amount }`
  * `quantity: { $gte: amount }`
* Tek document üzerindeki işlemleri mümkün olduğunca tek bir `findOneAndUpdate`, `updateOne` veya benzeri atomik sorguyla tamamla.
* Kullanıcı oluşturma işlemlerinde önce `findOne`, sonra `create` yapma; `upsert` ve `$setOnInsert` kullan.
* Cooldown kontrollerinde önce tarihi okuyup sonra güncelleme yapma. Cooldown uygunluk kontrolünü ve yeni tarihi yazmayı aynı atomik sorguda gerçekleştir.
* Aynı ödülün, daily’nin, quest claim’in veya purchase işleminin eşzamanlı olarak iki kez çalışmasını engelle.
* Birden fazla document veya collection değiştiren işlemlerde MongoDB transaction kullan.
* Transaction gerektiren işlemlerde tüm sorgulara aynı `session` nesnesini geçir.
* Her miktarı işlemden önce doğrula:

  * Pozitif olmalı
  * `Number.isSafeInteger` kontrolünden geçmeli
  * `NaN`, `Infinity`, negatif ve ondalıklı değerler reddedilmeli
* Atomik işlem başarısız olduğunda anlamlı bir sonuç döndür:

  * `INSUFFICIENT_BALANCE`
  * `COOLDOWN_ACTIVE`
  * `PRODUCT_NOT_FOUND`
  * `INSUFFICIENT_QUANTITY`
* Shard’lar arasında paylaşılan kritik state’i process memory’sinde tutma.
* MongoDB unique index hatalarını ve eşzamanlı upsert durumlarını düzgün yönet.
* Her servis ve repository metodunu race condition ihtimaline karşı incele.
* Kodun yalnızca normal senaryoda değil, aynı kullanıcı için aynı anda birden fazla komut çalıştığında da doğru sonuç vermesini sağla.

Örnek olarak şu yaklaşımı kullanma:

```js
const user = await User.findOne({ userId });
if (user.balance < amount) return false;
user.balance -= amount;
await user.save();
```

Bunun yerine şu yaklaşımı kullan:

```js
const user = await User.findOneAndUpdate(
    {
        userId,
        balance: { $gte: amount },
    },
    {
        $inc: {
            balance: -amount,
        },
    },
    {
        new: true,
        runValidators: true,
    },
);
```

Projede mevcut olan tüm model, service, repository, command ve event kodlarını bu kurallara göre gözden geçir ve atomik olmayan kritik işlemleri düzelt.

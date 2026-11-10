# Wirecove geliştirme planı

## Ücretsiz macOS yolu

Apple Developer Program üyeliği gerektirmeyen dağıtım yolu ayrıca
araştırılacak. Chrome PAC pilotu eski bir geçici yoldur; mevcut site ve
uygulama listeleri bu özel Mac'te etkinleştirilmiş Network Extension'ı
kullanır. Normal kullanıcı Mac'lerinde bu uzantının ücretsiz dağıtımı
doğrulanmadı. Desteklenmeyen uygulama veya UDP/HTTP/3 trafiği “korunuyor”
diye gösterilmeyecek.

Ücretsiz dağıtım, uzantıyla aynı kapsama sahipmiş gibi tanıtılmayacak.
Yönetici yetkisi isteyen `pf` yönlendirmesi varsayılan
çözüm değildir; alan adı ve uygulama eşleştirmesi ile geri alma gereksinimleri
ayrı araştırılmadan etkinleştirilmeyecek.

Tek arayüz; her işletim sisteminde ayrı gözlem ve uygulama bağdaştırıcısı. Ağ
trafiği, DNS ve DPI aynı uygulamada görünür. Bir ayar uygulanmadan önce mevcut
durum kaydedilir; durdurma, hata ve yeniden başlatma yollarında geri yükleme
test edilir. Ekrandaki bir denetim yalnızca gerçekten çalıştığında etkin olur.

Mac prototipinde bağlantı geçmişi, doğrudan DNS/TCP/TLS tanılaması ve yerel
SpoofDPI çalışıyor. Web sitesi formu herhangi bir HTTP(S) adresini doğrudan ve
DPI yardımlı yollarla sınar; tarayıcıya yönlendirme yapmaz. Geçmiş hedefleri IP:port olarak kaydedilir;
alan adı ve web sayfası başarısı bu ölçümden çıkarılmaz.

Yüklü uygulama envanteri ve uygulama/site seçimleri arayüzde kalıcıdır. Site
ve imzalı uygulama listeleri aynı macOS uzantı kuralına uygulanır; ekleme
yönlendirmeyi açar, “Tümünü kapat” iki listeyi durdurur. Seçilen siteler
varsayılan tarayıcıda açılır. Eski Chrome PAC yolu yalnız geçişte kapatılır.
Xcode 16.2 `~/Downloads/Xcode.app` içinde kurulu; Swift kural çekirdeği,
HTTP CONNECT doğrulaması ve TCP akış köprüsü SDK ile derleme kontrolünden geçti.
İmzasız `.systemextension` Xcode hedefi Intel ve Apple Silicon için derlendi;
yerel proxy hazır/kapalı port kontrolleri geçti.
İmzasız `WirecoveMacHost.app` uzantıyı doğru sistem uzantısı klasörüne gömüyor;
ana uygulamanın salt okunur paket kontrolü geçti. Aktivasyon ve proxy
yapılandırma sınıfları derleniyor. Geçici ad-hoc imzalı test paketi bu özel
yapılandırılmış Mac'te kullanıcı onayıyla etkinleşti. `example.com` TCP/443
akışı seçildi, yerel SpoofDPI'ye HTTP CONNECT kurdu ve HTTP 200 döndü. Test
bitince proxy yapılandırması kaldırıldı; sistem uzantısı kurulu kalıyor. Bu,
normal dağıtım için ücretsiz imzasız uzantı sözü değildir.
Küresel Command Line Tools seçimi bozuk ve geçerli kod imzalama kimliği yok.
Köprü varsayılan olarak kapalıdır; seçili TCP akışında doğrulandı.
Arayüzdeki site ve uygulama listeleri birden fazla kuralı uygular; durum
macOS yöneticisinden doğrulanıyor. Uygulama kimliğiyle akış seçimi `curl`
ile canlı testten geçti; başka uygulamalar için kabul testleri sürüyor.
Bir sonraki somut iş: proxy kapanması ve akış hatasında geri dönüşü ölçmek.
Ardından alan adı ve
kaynak uygulama eşleştirmesini gerçek akışlarda doğrulamak. Seçili siteyi
mevcut tarayıcı profilinde açıp normal site/oyun trafiğinin doğrudan kaldığı
ayrıca ölçülmeli. UDP/HTTP/3 ayrı kabul testidir.

## Yapılacaklar

- Chrome dışındaki tarayıcılar ve seçilen uygulamalarda yönlendirme için
  gerçek uygulama/site kabul testleri. Seçilmeyen oyun ve siteler doğrudan kalmalı.
- Site eklendiğinde doğrudan bağlantı, mevcut SpoofDPI profili ve gerekirse
  farklı güvenli profilleri sırayla sınayan otomatik yöntem seçimi. Başarılı
  yöntem hedefe özel kaydedilmeli; başarısızlıkta önceki yol geri yüklenmeli.
- Başarı yalnız HTTP yanıtıyla ilan edilmemeli: gerçek tarayıcı yüklemesi,
  yönlendirmeler, TLS, video oynatımında kullanılan CDN/API alan adları ve
  gerektiğinde HTTP/3 ayrı doğrulanmalı. Sayfa açılıp medya açılmıyorsa başarısız
  medya isteğinin alan adı ve hata türü gösterilmeli.

### Medya bağlantısı tanılama tasarımı

- macOS Network Extension kaynak uygulamayı ve bağlantı hedefini gözler; yalnız
  seçilen akışları işler. Şifreli HTTPS içeriğini çözmez ve tam video URL'sini
  her durumda göremez.
- Tarayıcı tarafında izinli, salt okunur istek gözlemcisi sayfanın çağırdığı
  medya/CDN alan adlarını, istek türünü ve bağlantı hatasını ilişkilendirir.
  Yol, sorgu, çerez, başlık ve içerik kaydedilmez; sonuçlar cihazda kalır.
- Wirecove başarısız alan adını kullanıcıya önerir, mevcut DPI yoluyla sınar;
  yalnız test başarılıysa siteye bağlı kural olarak ekler. Video oynatımı ayrıca
  doğrulanır. Desteklenmeyen tarayıcı ve uygulamalarda tahmini başarı gösterilmez.

**Hedef kullanıcı akışı:** Kullanıcı yalnız ana siteyi ekler. Wirecove aynı
sekmenin yönlendirme, API, görsel, video ve CDN isteklerini ilişkilendirir;
erişebilenleri doğrudan bırakır, erişemeyen hedefler için DPI profillerini
sınar ve başarılı hedefleri o site grubuna otomatik bağlar. Sayfa ile en az bir
gerçek medya oynatımı doğrulanmadan “çalışıyor” durumuna geçmez. Sonradan yeni
bir bağımlılık ortaya çıkarsa grup yeniden tanılanır. Başka sekme, uygulama ve
oyun bağlantıları bu gruptan etkilenmez. Bu akış henüz uygulanmadı.

| Aşama | Çıktı | Kabul ölçütü |
| --- | --- | --- |
| 1. Gözlem | Canlı TCP/UDP, uygulama listesi, etkin DNS ve proxy | Gerçek Mac verisi; uygulama/sayaç kapanışında sahte hız yok |
| 2. Geçmiş ve tanılama | Kalıcı bağlantı geçmişi, arama, hedef testi | Host, zaman, süreç ve sonuç; saklama süresi ve silme kontrolü |
| 3. DNS | Profil, otomatik seçim, IPv4/IPv6, sistem DoH, sızıntı testi | Profil uygulanır, doğrulanır ve eski ayar tam geri yüklenir |
| 4. Güvenlik duvarı | Uygulama bazlı gelen/giden izin ve engelleme | İzin/engelleme, yeniden başlatma ve geri alma testleri |
| 5. DPI | Uygulama/hedef bazlı yerel DPI yolu | Normal oyun ve siteler doğrudan; yalnız seçilen akış işlenir |
| 6. Dağıtım | İmzalı Mac paketi; Windows/Linux bağdaştırıcıları | Her sistemde aynı arayüz ve özellik durumu açıkça görünür |

## macOS bileşenleri

- **Gözlem:** Şimdilik `nettop`; bağlantı geçmişi ve uygulama kimliği için
  sınırları ayrıca ölçülür. Arayüz gözlem verisi ile sistem ayarını birbirinden
  ayırır.
- **DNS:** Etkin resolver gözlemi `scutil` ile salt okunur. Düz DNS hizmet
  ayarları için SystemConfiguration; DoH için `NEDNSSettingsManager` ve
  `NEDNSOverHTTPSSettings`. Her profil değişiminden önce hizmet/protokol durumu
  saklanır. Etkinleşme ve sızıntı testi ayrı doğrulanır.
- **Güvenlik duvarı:** İmzalı Network Extension `NEFilterDataProvider` akışa
  izin/engelleme kararı verir. İlk kural kümesi güvenli varsayılan olarak izin
  verir. Kullanıcı onayı, yetki ve kaldırma akışı paketin parçasıdır.
- **DPI:** SpoofDPI Discord denemesinde yerel işlem olarak çalışır. Seçilen hedefe veya
  uygulamaya yönlendirme için gerektiğinde `NETransparentProxyProvider`; normal
  akışlar doğrudan devam eder. Sistem çapında proxy açmak nihai tasarım değil.
  DPI yöntemi başarısızsa uygulama bu sonucu gösterir ve önceki yolu geri alır.

## Ayrı kabul testleri

- DNS: IPv4/IPv6 çözümleme, DoH etkinliği, sızıntı testi, profil değişimi,
  kapanma ve yeniden başlatma sonrası geri yükleme.
- Firewall: uygulama bazlı gelen/giden bağlantı, izin/engelleme ve yeniden
  başlatma sonrası kural tutarlılığı.
- DPI: engelli bir web hedefi, Discord masaüstü girişi, iki yönlü ses ve
  doğrulanmış HTTP/3 bağlantısı ayrı ayrı. Çalışan oyun bağlantısı seçilen
  DPI kuralı dışındayken aynı yolu ve hızı korumalı.

## Kaynaklar

- Apple [DNS Settings](https://developer.apple.com/documentation/networkextension/dns-settings)
- Apple [NEDNSSettingsManager](https://developer.apple.com/documentation/networkextension/nednssettingsmanager)
- Apple [SystemConfiguration DNS protokolü](https://developer.apple.com/documentation/systemconfiguration/network-protocol-types)
- Apple [NEFilterDataProvider](https://developer.apple.com/documentation/networkextension/nefilterdataprovider)
- Apple [NETransparentProxyProvider](https://developer.apple.com/documentation/networkextension/netransparentproxyprovider)
- [SpoofDPI](https://github.com/xvzc/spoofdpi) (Apache-2.0)

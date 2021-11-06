const phoneNumberFormatter = function(number) {
    //menghilangkan karakter selain angka
    let formatted = number.replace(/\D/g, '');

    //menghilangkan angka 0 didepan
    //kemudian diganti dengan format kode negara

    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substr(1);
    }

    if (!formatted.endsWith('@c.us')) {
        formatted += '@c.us';
    }

    return formatted;
}

module.exports = {
    phoneNumberFormatter
}
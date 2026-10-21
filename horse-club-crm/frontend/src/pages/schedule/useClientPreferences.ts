import { useEffect, useRef } from 'react'
import type { FormInstance } from 'antd'
import type { Client, Horse, Trainer } from '../catalogs/types'
import { activePreferredHorse, activePreferredTrainer, preferredValue } from '../clients/preferredResources'

export function useClientPreferences(form: FormInstance, client: Client | undefined, horses: Horse[], trainers: Trainer[], horsePath: (string | number)[], disabled: boolean, trainerManual = false, applyTrainer = true) {
  const manual = useRef({ horse: false, trainer: false })
  const automatic = useRef<{ horse?: string; trainer?: string }>({})
  const path = JSON.stringify(horsePath)
  useEffect(() => {
    if (disabled) return
    const horse = horses.find(row => row.id === client?.preferredHorseId)
    const trainer = trainers.find(row => row.id === client?.preferredTrainerId)
    const horseName = JSON.parse(path) as (string | number)[]
    if (form.getFieldValue(horseName) && form.getFieldValue(horseName) !== automatic.current.horse) manual.current.horse = true
    if (form.getFieldValue('trainerId') && form.getFieldValue('trainerId') !== automatic.current.trainer) {
      manual.current.trainer = true
    }
    const horseValue = preferredValue(form.getFieldValue(horseName), automatic.current.horse, manual.current.horse, client?.preferredHorseId, Boolean(horse && activePreferredHorse(horse)))
    form.setFieldValue(horseName, horseValue)
    automatic.current.horse = manual.current.horse ? undefined : horseValue
    if (applyTrainer) {
      const trainerValue = preferredValue(form.getFieldValue('trainerId'), automatic.current.trainer, trainerManual || manual.current.trainer, client?.preferredTrainerId, Boolean(trainer && activePreferredTrainer(trainer)))
      form.setFieldValue('trainerId', trainerValue)
      automatic.current.trainer = trainerValue
    }
  }, [form, client, horses, trainers, path, disabled, trainerManual, applyTrainer])
  return {
    horseChanged: () => { manual.current.horse = true },
    trainerChanged: () => { manual.current.trainer = true },
  }
}
